// Voice chat: a WebRTC full mesh between everyone in voice on the island.
// The server only relays signalling. The newest member sends offers to the
// people already in voice, so two peers never offer to each other at once.

import type { VoiceSignal } from "../../../shared/protocol";
import type { GameSocket } from "./socket";

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  initiator: boolean;
  audio: HTMLAudioElement;
  analyser: AnalyserNode | null;
  pending: RTCIceCandidateInit[];
  level: number;
  heldUntil: number;
}

const DEFAULT_ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const SPEAK_THRESHOLD = 0.035;

export class VoiceClient {
  joined = false;
  muted = false;
  /** Fade voices with distance. */
  proximity = false;
  /** Audio playback was blocked by the browser and needs a click. */
  needsUnlock = false;
  listenOnly = false;
  onChange: (() => void) | null = null;

  private local: MediaStream | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localLevel = 0;
  private localHeld = 0;
  private ctx: AudioContext | null = null;
  private peers = new Map<string, Peer>();
  private ice: RTCIceServer[] | null = null;
  private readonly buffer = new Uint8Array(512);
  private readonly audioRoot: HTMLElement;

  constructor(
    private readonly socket: GameSocket,
    private readonly selfId: () => string,
    private readonly toast: (msg: string, kind?: "info" | "good" | "warn") => void,
  ) {
    this.audioRoot = document.createElement("div");
    this.audioRoot.hidden = true;
    document.body.append(this.audioRoot);
    socket.on("voice:signal", ({ from, data }) => void this.onSignal(from, data));
    socket.on("voice:peer-left", (id) => this.closePeer(id));
  }

  private async iceServers(): Promise<RTCIceServer[]> {
    if (this.ice) return this.ice;
    try {
      const res = await fetch("/api/config", { cache: "no-store" });
      const json = (await res.json()) as { iceServers?: RTCIceServer[] };
      this.ice = Array.isArray(json.iceServers) && json.iceServers.length ? json.iceServers : DEFAULT_ICE;
    } catch {
      this.ice = DEFAULT_ICE;
    }
    return this.ice;
  }

  async join(): Promise<void> {
    if (this.joined) return;
    if (!("RTCPeerConnection" in window)) {
      this.toast("Voice chat isn't supported in this browser.", "warn");
      return;
    }
    await this.iceServers();
    this.ctx = new AudioContext();
    try {
      this.local = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.listenOnly = false;
      const src = this.ctx.createMediaStreamSource(this.local);
      this.localAnalyser = this.ctx.createAnalyser();
      this.localAnalyser.fftSize = 512;
      src.connect(this.localAnalyser);
    } catch {
      this.local = null;
      this.listenOnly = true;
      this.toast("No microphone access, so you joined voice to listen only.", "warn");
    }
    this.joined = true;
    this.setMuted(this.muted);
    this.socket.emit("voice:join", (peers) => {
      for (const id of peers) void this.offerTo(id);
    });
    this.onChange?.();
  }

  leave(): void {
    if (!this.joined) return;
    this.joined = false;
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.localAnalyser = null;
    void this.ctx?.close();
    this.ctx = null;
    this.socket.emit("voice:leave");
    this.onChange?.();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    this.onChange?.();
  }

  /** Retry playback after the browser blocked autoplay. */
  unlock(): void {
    this.needsUnlock = false;
    void this.ctx?.resume();
    for (const p of this.peers.values()) void p.audio.play().catch(() => (this.needsUnlock = true));
    this.onChange?.();
  }

  peerIds(): string[] {
    return [...this.peers.keys()];
  }

  isSpeaking(id: string): boolean {
    const now = performance.now();
    if (id === this.selfId()) return this.joined && !this.muted && now < this.localHeld;
    const p = this.peers.get(id);
    return !!p && now < p.heldUntil;
  }

  level(id: string): number {
    if (id === this.selfId()) return this.muted ? 0 : this.localLevel;
    return this.peers.get(id)?.level ?? 0;
  }

  private send(to: string, data: VoiceSignal): void {
    this.socket.emit("voice:signal", { to, data });
  }

  private createPeer(id: string, initiator: boolean): Peer {
    this.closePeer(id);
    const pc = new RTCPeerConnection({ iceServers: this.ice ?? DEFAULT_ICE });
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");
    this.audioRoot.append(audio);
    const peer: Peer = { id, pc, initiator, audio, analyser: null, pending: [], level: 0, heldUntil: 0 };
    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      const c = ev.candidate.toJSON();
      this.send(id, {
        candidate: {
          candidate: c.candidate ?? "",
          sdpMid: c.sdpMid ?? null,
          sdpMLineIndex: c.sdpMLineIndex ?? null,
          usernameFragment: c.usernameFragment ?? null,
        },
      });
    };
    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      audio.srcObject = stream;
      audio.play().catch(() => {
        this.needsUnlock = true;
        this.onChange?.();
      });
      if (this.ctx) {
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 512;
        this.ctx.createMediaStreamSource(stream).connect(analyser);
        peer.analyser = analyser;
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" && peer.initiator && this.joined) void this.renegotiate(peer, true);
      this.onChange?.();
    };
    this.peers.set(id, peer);
    return peer;
  }

  private async offerTo(id: string): Promise<void> {
    if (!this.joined) return;
    const peer = this.createPeer(id, true);
    if (this.local) for (const t of this.local.getTracks()) peer.pc.addTrack(t, this.local);
    else peer.pc.addTransceiver("audio", { direction: "recvonly" });
    await this.renegotiate(peer, false);
  }

  private async renegotiate(peer: Peer, iceRestart: boolean): Promise<void> {
    try {
      if (iceRestart) peer.pc.restartIce();
      const offer = await peer.pc.createOffer({ iceRestart });
      await peer.pc.setLocalDescription(offer);
      const sdp = peer.pc.localDescription;
      if (sdp) this.send(peer.id, { sdp: { type: "offer", sdp: sdp.sdp } });
    } catch (err) {
      console.warn("voice: offer failed", err);
    }
  }

  private async onSignal(from: string, data: VoiceSignal): Promise<void> {
    if (!this.joined) return;
    try {
      if (data.sdp?.type === "offer") {
        let peer = this.peers.get(from);
        const fresh = !peer;
        if (!peer) peer = this.createPeer(from, false);
        await peer.pc.setRemoteDescription({ type: "offer", sdp: data.sdp.sdp });
        if (fresh && this.local) for (const t of this.local.getTracks()) peer.pc.addTrack(t, this.local);
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        const sdp = peer.pc.localDescription;
        if (sdp) this.send(from, { sdp: { type: "answer", sdp: sdp.sdp } });
        await this.flush(peer);
      } else if (data.sdp?.type === "answer") {
        const peer = this.peers.get(from);
        if (!peer) return;
        await peer.pc.setRemoteDescription({ type: "answer", sdp: data.sdp.sdp });
        await this.flush(peer);
      } else if (data.candidate) {
        const peer = this.peers.get(from);
        if (!peer) return;
        const init: RTCIceCandidateInit = {
          candidate: data.candidate.candidate,
          sdpMid: data.candidate.sdpMid,
          sdpMLineIndex: data.candidate.sdpMLineIndex,
          usernameFragment: data.candidate.usernameFragment ?? undefined,
        };
        if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(init);
        else peer.pending.push(init);
      }
    } catch (err) {
      console.warn("voice: signalling error", err);
    }
  }

  private async flush(peer: Peer): Promise<void> {
    const pending = peer.pending.splice(0);
    for (const c of pending) {
      try {
        await peer.pc.addIceCandidate(c);
      } catch {
        // Stale candidates after an ICE restart are harmless.
      }
    }
  }

  private closePeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;
    peer.pc.close();
    peer.audio.srcObject = null;
    peer.audio.remove();
    this.onChange?.();
  }

  private measure(analyser: AnalyserNode): number {
    analyser.getByteTimeDomainData(this.buffer);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const v = (this.buffer[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.buffer.length);
  }

  /** Per frame: speaking meters and (when enabled) distance-based volume. */
  update(dt: number, distanceTo: (id: string) => number | null): void {
    if (!this.joined) return;
    const now = performance.now();
    const k = 1 - Math.exp(-dt * 12);
    if (this.localAnalyser) {
      const lvl = this.measure(this.localAnalyser);
      this.localLevel += (lvl - this.localLevel) * k;
      if (lvl > SPEAK_THRESHOLD) this.localHeld = now + 300;
    }
    for (const p of this.peers.values()) {
      if (p.analyser) {
        const lvl = this.measure(p.analyser);
        p.level += (lvl - p.level) * k;
        if (lvl > SPEAK_THRESHOLD) p.heldUntil = now + 300;
      }
      let volume = 1;
      if (this.proximity) {
        const d = distanceTo(p.id);
        volume = d === null ? 0.05 : Math.min(1, Math.max(0.05, 1 - (d - 15) / 185));
      }
      if (Math.abs(p.audio.volume - volume) > 0.01) p.audio.volume = volume;
    }
  }

  dispose(): void {
    this.leave();
    this.socket.off("voice:signal");
    this.socket.off("voice:peer-left");
    this.audioRoot.remove();
  }
}
