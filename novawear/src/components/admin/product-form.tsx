"use client";

import { useActionState, useState } from "react";
import type { Availability, Category } from "@prisma/client";
import { saveProductAction } from "@/actions/admin";
import { availabilityLabel, availabilityValues, categories, categoryInfo, colorPresets, formatPrice, sizeOptions } from "@/config/shop";
import { initialFormState } from "@/lib/validation/common";
import { cn } from "@/lib/utils";
import { Garment } from "@/components/brand/garment";
import { AvailabilityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, FieldError, FormMessage, Input, Select, Textarea } from "@/components/ui/field";
import { Close } from "@/components/ui/icons";

type Color = { name: string; hex: string };

export type ProductFormValues = {
  id: string;
  name: string;
  description: string;
  details: string;
  category: Category;
  price: string;
  availability: Availability;
  preorderNote: string;
  sizes: string[];
  colors: Color[];
  published: boolean;
  featured: boolean;
  sortOrder: number;
};

const availabilityHelp: Record<Availability, string> = {
  IN_STOCK: "Ships now.",
  PRE_ORDER: "Customers reserve their size; you ship when the drop lands.",
  SOLD_OUT: "Stays visible, can't be ordered.",
};

export function ProductForm({ product }: { product?: ProductFormValues }) {
  const [state, action, pending] = useActionState(saveProductAction, initialFormState);
  const e = state.fieldErrors ?? {};
  const v = state.values ?? {};

  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState<Category>(product?.category ?? "TSHIRT");
  const [price, setPrice] = useState(product?.price ?? "");
  const [availability, setAvailability] = useState<Availability>(product?.availability ?? "IN_STOCK");
  const [sizes, setSizes] = useState<string[]>(product?.sizes ?? ["S", "M", "L", "XL"]);
  const [colors, setColors] = useState<Color[]>(product?.colors ?? [colorPresets[0]!]);
  const [customName, setCustomName] = useState("");
  const [customHex, setCustomHex] = useState("#2B4C7E");

  const hasColor = (hex: string) => colors.some((c) => c.hex.toUpperCase() === hex.toUpperCase());
  const togglePreset = (c: Color) => setColors((cs) => (hasColor(c.hex) ? cs.filter((x) => x.hex.toUpperCase() !== c.hex.toUpperCase()) : [...cs, c]));
  const addCustom = () => {
    const nameTrim = customName.trim();
    if (!nameTrim || hasColor(customHex)) return;
    setColors((cs) => [...cs, { name: nameTrim.slice(0, 30), hex: customHex.toUpperCase() }]);
    setCustomName("");
  };
  const parsedPrice = Math.round(parseFloat(price.replace(",", ".")) * 100);

  return (
    <form action={action} noValidate className="grid gap-6 lg:grid-cols-[1fr_300px]">
      {product && <input type="hidden" name="id" value={product.id} />}
      <input type="hidden" name="colors" value={JSON.stringify(colors)} />

      <div className="space-y-6 bg-paper p-[clamp(1.25rem,2.5vw,2rem)]">
        {state.message && <FormMessage tone={state.ok ? "success" : "error"}>{state.message}</FormMessage>}

        <Field id="name" label="Product name" error={e.name}>
          {(a) => <Input {...a} name="name" required value={name} onChange={(ev) => setName(ev.target.value)} placeholder="e.g. Prowl Hoodie" />}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="category" label="Category" error={e.category}>
            {(a) => (
              <Select {...a} name="category" value={category} onChange={(ev) => setCategory(ev.target.value as Category)}>
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field id="price" label="Price" error={e.price} hint="e.g. 45 or 45.90">
            {(a) => <Input {...a} name="price" inputMode="decimal" required value={price} onChange={(ev) => setPrice(ev.target.value)} placeholder="0.00" />}
          </Field>
        </div>

        <fieldset>
          <legend className="eyebrow mb-2 text-body">Availability</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {availabilityValues.map((a) => (
              <label key={a} className={cn("cursor-pointer border-2 p-3.5 transition-colors", availability === a ? "border-ink bg-bone" : "border-line hover:border-ink/40")}>
                <input type="radio" name="availability" value={a} checked={availability === a} onChange={() => setAvailability(a)} className="sr-only" />
                <span className="label block text-sm">{availabilityLabel[a]}</span>
                <span className="mt-1 block text-xs leading-snug text-muted">{availabilityHelp[a]}</span>
              </label>
            ))}
          </div>
          <FieldError errors={e.availability} />
        </fieldset>

        {availability === "PRE_ORDER" && (
          <Field id="preorderNote" label="Pre-order note" error={e.preorderNote} optional hint='Shown on the product, e.g. "Ships mid-November".'>
            {(a) => <Input {...a} name="preorderNote" defaultValue={v.preorderNote ?? product?.preorderNote} maxLength={120} />}
          </Field>
        )}

        <fieldset>
          <legend className="eyebrow mb-2 text-body">Sizes</legend>
          <div className="flex flex-wrap gap-1.5">
            {sizeOptions.map((s) => {
              const on = sizes.includes(s);
              return (
                <label key={s} className="cursor-pointer">
                  <input
                    type="checkbox"
                    name="sizes"
                    value={s}
                    checked={on}
                    onChange={() => setSizes((cur) => (on ? cur.filter((x) => x !== s) : [...cur, s]))}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "flex h-11 min-w-13 items-center justify-center border-2 px-3 text-sm font-bold [font-stretch:80%] transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink",
                      on ? "border-ink bg-ink text-bone" : "border-line-strong bg-paper hover:border-ink",
                    )}
                  >
                    {s}
                  </span>
                </label>
              );
            })}
          </div>
          <FieldError errors={e.sizes} />
        </fieldset>

        <fieldset>
          <legend className="eyebrow mb-2 text-body">Colours</legend>
          <div className="flex flex-wrap gap-2">
            {colorPresets.map((c) => {
              const on = hasColor(c.hex);
              return (
                <button
                  key={c.hex}
                  type="button"
                  aria-pressed={on}
                  onClick={() => togglePreset(c)}
                  className={cn("flex h-11 items-center gap-2 rounded-full border-2 bg-paper pl-1.5 pr-3.5 text-sm font-semibold transition-colors", on ? "border-ink" : "border-line hover:border-ink/40")}
                >
                  <span className="size-7 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ background: c.hex }} />
                  {c.name}
                </button>
              );
            })}
          </div>
          {colors.filter((c) => !colorPresets.some((p) => p.hex.toUpperCase() === c.hex.toUpperCase())).length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Custom colours">
              {colors
                .filter((c) => !colorPresets.some((p) => p.hex.toUpperCase() === c.hex.toUpperCase()))
                .map((c) => (
                  <li key={c.hex} className="flex h-11 items-center gap-2 rounded-full border-2 border-ink bg-paper pl-1.5 pr-1.5 text-sm font-semibold">
                    <span className="size-7 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ background: c.hex }} />
                    {c.name}
                    <button type="button" onClick={() => setColors((cs) => cs.filter((x) => x.hex !== c.hex))} aria-label={`Remove ${c.name}`} className="flex size-8 items-center justify-center rounded-full hover:bg-ink/10">
                      <Close size={14} />
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow text-2xs">Custom colour</span>
              <input type="color" value={customHex} onChange={(ev) => setCustomHex(ev.target.value)} className="h-11 w-14 cursor-pointer border-2 border-line-strong bg-paper p-1" aria-label="Pick a custom colour" />
            </label>
            <Input
              value={customName}
              onChange={(ev) => setCustomName(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter") {
                  ev.preventDefault();
                  addCustom();
                }
              }}
              placeholder="Colour name, e.g. Royal"
              aria-label="Custom colour name"
              className="h-11 max-w-56"
            />
            <Button type="button" variant="outline" size="sm" className="h-11" onClick={addCustom}>
              Add colour
            </Button>
          </div>
          <FieldError errors={e.colors} />
        </fieldset>

        <Field id="description" label="Description" error={e.description}>
          {(a) => <Textarea {...a} name="description" required rows={4} defaultValue={v.description ?? product?.description} placeholder="What makes this piece special." />}
        </Field>
        <Field id="details" label="Details" error={e.details} optional hint="One per line — fit, fabric, print. Shown as a list.">
          {(a) => <Textarea {...a} name="details" rows={4} defaultValue={v.details ?? product?.details} placeholder={"Heavyweight cotton\nRelaxed fit\nLeopard print on the back"} />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_140px] sm:items-end">
          <Checkbox name="published" defaultChecked={product ? product.published : true} label="Show in the shop" />
          <Checkbox name="featured" defaultChecked={product?.featured ?? false} label="Feature on the home page" />
          <Field id="sortOrder" label="Order" hint="Lower comes first">
            {(a) => <Input {...a} name="sortOrder" type="number" min={0} max={9999} defaultValue={v.sortOrder ?? product?.sortOrder ?? 0} className="h-11" />}
          </Field>
        </div>

        <div className="flex flex-wrap gap-3 border-t border-line pt-6">
          <Button type="submit" size="lg" pending={pending} arrow>
            {pending ? "Saving" : product ? "Save changes" : "Create product"}
          </Button>
        </div>
      </div>

      <aside aria-label="Live preview" className="lg:sticky lg:top-8 lg:self-start">
        <p className="eyebrow mb-2.5">Live preview</p>
        <div className="bg-paper p-3.5 transition-transform duration-500 hover:-rotate-1 hover:-translate-y-1">
          <div className="relative aspect-[4/5] bg-ground-2">
            <AvailabilityBadge availability={availability} className="absolute left-2.5 top-2.5" />
            <div className="absolute inset-[12%_10%_8%]">
              <Garment kind={categoryInfo(category).garment} color={colors[0]?.hex ?? "#DAD9D4"} />
            </div>
          </div>
          <p className="mt-3 font-bold">{name || "Product name"}</p>
          <p className="mt-1 font-mono text-xs text-muted">{Number.isFinite(parsedPrice) && parsedPrice > 0 ? formatPrice(parsedPrice) : "Price"}</p>
          <div className="mt-2 flex gap-1.5">
            {colors.map((c) => (
              <span key={c.hex} className="size-3.5 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]" style={{ background: c.hex }} />
            ))}
          </div>
          <p className="mt-2 font-mono text-2xs text-muted">{sizes.length ? sizeOptions.filter((s) => sizes.includes(s)).join(" · ") : "No sizes yet"}</p>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">Uploaded photos replace the illustration in the shop.</p>
      </aside>
    </form>
  );
}
