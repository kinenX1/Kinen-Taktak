// Build mode: shows the workshop panel and the build grid, previews the
// selected blueprint as a ghost on the hovered cells, and places or removes
// pieces through the server.

import * as THREE from "three";
import { cellAt, checkPlacement, footprint, piecePosition, rotRadians, type Rot } from "../../../shared/boat";
import { GRID_L, GRID_W } from "../../../shared/constants";
import { clamp } from "../../../shared/math";
import type { PieceDef } from "../../../shared/pieces";
import type { Builder, CreateBuilder } from "../contracts";
import { buildPieceObject, disposePieceObject, initPieceRendering } from "../scene/pieceMesh";
import { createWorkshopPanel } from "../ui/workshop";

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tmp = new THREE.Vector3();

export const createBuilder: CreateBuilder = (deps) => {
  const { ctx, state, socket } = deps;
  initPieceRendering(ctx.renderer);

  let active = false;
  let selectedId: string | null = null;
  let rot: Rot = 0;
  let removeMode = false;
  let pointer: { x: number; y: number } | null = null;
  let ghost: THREE.Group | null = null;
  let ghostDefId: string | null = null;
  let pending = false;
  let target: { gx: number; gz: number; ok: boolean; reason?: string } | null = null;

  const panel = createWorkshopPanel({
    state,
    socket,
    mount: deps.mount,
    toast: deps.toast,
    getStats: () => deps.getOwnBoat().stats,
    onSelect: (id) => {
      selectedId = id;
      if (id) setRemove(false);
    },
    onRotate: () => rotate(),
    onToggleRemove: () => setRemove(!removeMode),
    onLaunch: () => launch(),
    onClose: () => deps.onExit(),
  });

  function selectedDef(): PieceDef | undefined {
    return selectedId ? state.defs.get(selectedId) : undefined;
  }

  function setRemove(on: boolean): void {
    removeMode = on;
    panel.setRemoveMode(on);
    if (!on) deps.getOwnBoat().setHighlight(null);
  }

  function rotate(): void {
    rot = ((rot + 1) % 4) as Rot;
  }

  function launch(): void {
    socket.emit("boat:launch", (res) => {
      if (res.ok) deps.onLaunched();
      else deps.toast(res.error, "warn");
    });
  }

  function clearGhost(): void {
    if (!ghost) return;
    ghost.removeFromParent();
    disposePieceObject(ghost);
    ghost = null;
    ghostDefId = null;
  }

  function ensureGhost(def: PieceDef): THREE.Group {
    if (ghost && ghostDefId === def.id) return ghost;
    clearGhost();
    ghost = buildPieceObject(def, { ghost: true });
    ghost.renderOrder = 4;
    ghostDefId = def.id;
    deps.getOwnBoat().root.add(ghost);
    return ghost;
  }

  function rayFrom(x: number, y: number): THREE.Ray {
    ndc.set(x, y);
    raycaster.setFromCamera(ndc, ctx.camera);
    return raycaster.ray;
  }

  /** Works out where the selected piece would go for the current pointer. */
  function computeTarget(def: PieceDef): typeof target {
    if (!pointer) return null;
    const boat = deps.getOwnBoat();
    const hit = boat.hitTest(rayFrom(pointer.x, pointer.y));
    if (!hit) return null;
    // Top faces stack on that cell; side faces build next to it.
    tmp.copy(hit.point);
    if (hit.piece && hit.normal.y < 0.5) tmp.addScaledVector(hit.normal, 0.5);
    else tmp.addScaledVector(hit.normal, -0.01);
    const cell = cellAt(tmp.x, tmp.z);
    const { fw, fd } = footprint(def, rot);
    const gx = clamp(cell.gx - Math.floor((fw - 1) / 2), 0, GRID_W - fw);
    const gz = clamp(cell.gz - Math.floor((fd - 1) / 2), 0, GRID_L - fd);
    const boatData = state.boats.get(state.selfId);
    const check = checkPlacement(boatData?.pieces ?? [], def, gx, gz, rot, state.defs.get);
    return check.ok ? { gx, gz, ok: true } : { gx, gz, ok: false, reason: check.reason };
  }

  function refreshPreview(): void {
    const boat = deps.getOwnBoat();
    if (!active) return;
    if (removeMode) {
      clearGhost();
      const piece = pointer ? boat.pickPiece(rayFrom(pointer.x, pointer.y)) : null;
      boat.setHighlight(piece?.uid ?? null);
      return;
    }
    boat.setHighlight(null);
    const def = selectedDef();
    if (!def) {
      clearGhost();
      target = null;
      return;
    }
    target = computeTarget(def);
    const g = ensureGhost(def);
    if (!target) {
      g.visible = false;
      return;
    }
    const boatData = state.boats.get(state.selfId);
    const check = checkPlacement(boatData?.pieces ?? [], def, target.gx, target.gz, rot, state.defs.get);
    const y = check.ok ? check.y : 0;
    const pos = piecePosition({ gx: target.gx, gz: target.gz, rot, y }, def);
    g.visible = true;
    g.position.set(pos.x, pos.y + 0.02, pos.z);
    g.rotation.set(0, rotRadians(rot), 0);
    (g.userData.ghostMaterial as THREE.MeshBasicMaterial).color.set(target.ok ? "#7cff9b" : "#ff5d5d");
  }

  function removeAt(x: number, y: number): void {
    const piece = deps.getOwnBoat().pickPiece(rayFrom(x, y));
    if (!piece || pending) return;
    pending = true;
    socket.emit("boat:remove", piece.uid, (res) => {
      pending = false;
      if (!res.ok) deps.toast(res.error, "warn");
    });
  }

  const builder: Builder = {
    get active() {
      return active;
    },
    enter() {
      if (active) return;
      active = true;
      deps.getOwnBoat().setGridVisible(true);
      panel.show();
    },
    exit() {
      if (!active) return;
      active = false;
      clearGhost();
      setRemove(false);
      deps.getOwnBoat().setGridVisible(false);
      deps.getOwnBoat().setHighlight(null);
      panel.hide();
    },
    onPointerMove(x, y) {
      pointer = { x, y };
    },
    onPrimaryClick(x, y, shift) {
      if (!active) return;
      pointer = { x, y };
      if (removeMode || shift) {
        removeAt(x, y);
        return;
      }
      const def = selectedDef();
      if (!def) {
        deps.toast("Pick a piece from your inventory first, or ask your AI for one.", "info");
        return;
      }
      const t = computeTarget(def);
      if (!t) return;
      if (!t.ok) {
        deps.toast(t.reason ?? "That doesn't fit there.", "warn");
        return;
      }
      if (pending) return;
      pending = true;
      socket.emit("boat:place", { defId: def.id, gx: t.gx, gz: t.gz, rot }, (res) => {
        pending = false;
        if (!res.ok) deps.toast(res.error, "warn");
      });
    },
    onKey(code) {
      if (!active) return false;
      switch (code) {
        case "KeyR":
          rotate();
          return true;
        case "KeyX":
          setRemove(!removeMode);
          return true;
        case "Escape":
          if (removeMode) setRemove(false);
          else if (selectedId) panel.setSelected(null);
          else deps.onExit();
          return true;
        case "KeyB":
          deps.onExit();
          return true;
        case "Enter":
        case "KeyT":
          panel.focusPrompt();
          return true;
        default:
          return false;
      }
    },
    update() {
      if (active) refreshPreview();
    },
  };
  return builder;
};
