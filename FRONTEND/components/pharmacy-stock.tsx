"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Icon, PlatformShell, StatusBadge } from "@/components/platform";

type RecordValue = Record<string, unknown>;
type AttributeRow = { key: string; value: string };
type EditorState = { mode: "add" | "edit"; item?: RecordValue } | null;

const STATUS_OPTIONS = [
  { id: "IN_STOCK", label: "In stock" },
  { id: "LOW", label: "Low stock" },
  { id: "OUT_OF_STOCK", label: "Out of stock" },
] as const;

function records(value: unknown): RecordValue[] {
  if (Array.isArray(value)) return value.filter((item): item is RecordValue => Boolean(item && typeof item === "object"));
  if (value && typeof value === "object") {
    const object = value as RecordValue;
    for (const key of ["items", "data", "results"]) if (Array.isArray(object[key])) return records(object[key]);
  }
  return [];
}

function text(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function money(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? `${(parsed / 100).toLocaleString("en-DZ")} DZD` : "—";
}

function date(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf()) ? text(value) : parsed.toLocaleDateString("en", { dateStyle: "medium" });
}

function medicineOf(item: RecordValue): RecordValue {
  return item.medicine && typeof item.medicine === "object" ? (item.medicine as RecordValue) : {};
}

function stockImage(item: RecordValue) {
  const explicit = text(item.image_url, "");
  if (explicit) return explicit;
  const medicine = medicineOf(item);
  const form = `${text(medicine.form, "")} ${text(medicine.category, "")}`.toLowerCase();
  if (form.includes("sirop") || form.includes("suspension") || form.includes("solution") || form.includes("buvable") || form.includes("goutte")) return "/medicine-bottle.svg";
  if (form.includes("crème") || form.includes("creme") || form.includes("pommade") || form.includes("gel") || form.includes("tube")) return "/medicine-tube.svg";
  if (form.includes("gélule") || form.includes("gelule") || form.includes("capsule")) return "/medicine-capsule.svg";
  return "/medicine-box.svg";
}

function statusMeta(value: unknown) {
  const status = String(value ?? "").toUpperCase();
  if (status === "IN_STOCK") return { label: "In stock", tone: "success" };
  if (status === "LOW") return { label: "Low stock", tone: "warning" };
  if (status === "OUT_OF_STOCK") return { label: "Out of stock", tone: "neutral" };
  return { label: text(status, "Unknown"), tone: "neutral" };
}

function attributesOf(item: RecordValue): AttributeRow[] {
  const source = item.attributes;
  if (!source || typeof source !== "object") return [];
  return Object.entries(source as Record<string, unknown>)
    .filter(([, value]) => value !== null && value !== undefined && String(value) !== "")
    .map(([key, value]) => ({ key, value: String(value) }));
}

function loadImageFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("The selected file is not a readable image.")); };
    image.src = url;
  });
}

/** Compress a device picture to a compact JPEG data URL that fits the API limit. */
async function compressImageFile(file: File) {
  const image = await loadImageFile(file);
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("The selected image is empty.");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser cannot process this image.");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const scale = Math.min(1, 760 / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    let quality = 0.82;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    while (dataUrl.length > 78000 && quality > 0.34) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL("image/jpeg", quality);
    }
    if (dataUrl.length <= 78000) return dataUrl;
    width = Math.round(width * 0.8);
    height = Math.round(height * 0.8);
  }
  throw new Error("This picture is too large. Please choose a smaller image.");
}

export function PharmacyStockPage() {
  const [items, setItems] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [editor, setEditor] = useState<EditorState>(null);
  const [medicineQuery, setMedicineQuery] = useState("");
  const [medicineResults, setMedicineResults] = useState<RecordValue[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedMedicine, setSelectedMedicine] = useState<RecordValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [form, setForm] = useState({ stock_status: "IN_STOCK", quantity: "", price: "", image_url: "" });
  const [attributes, setAttributes] = useState<AttributeRow[]>([]);

  function load() {
    setLoading(true);
    setError("");
    api.pharmacyStock("limit=100&sort=updated_at&order=desc")
      .then((value) => setItems(records(value)))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load your stock."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    api.pharmacyStock("limit=100&sort=updated_at&order=desc")
      .then((value) => { if (active) setItems(records(value)); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Unable to load your stock."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return items.filter((item) => {
      const medicine = medicineOf(item);
      const status = String(item.stock_status ?? "").toUpperCase();
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      if (!term) return true;
      return [medicine.brand_name, medicine.name_ar, medicine.inn_dci, medicine.manufacturer, medicine.regulatory_code]
        .some((value) => String(value ?? "").toLowerCase().includes(term));
    });
  }, [items, query, statusFilter]);

  const inStock = items.filter((item) => String(item.stock_status).toUpperCase() === "IN_STOCK").length;
  const low = items.filter((item) => String(item.stock_status).toUpperCase() === "LOW").length;
  const out = items.filter((item) => String(item.stock_status).toUpperCase() === "OUT_OF_STOCK").length;
  const inventoryValue = items.reduce((total, item) => {
    const quantity = Number(item.quantity ?? 0);
    const price = Number(item.unit_price_centimes ?? 0);
    return total + (Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : 0);
  }, 0);

  function resetEditor() {
    setEditor(null);
    setSelectedMedicine(null);
    setMedicineQuery("");
    setMedicineResults([]);
    setAttributes([]);
    setImageBusy(false);
    setForm({ stock_status: "IN_STOCK", quantity: "", price: "", image_url: "" });
    setError("");
  }

  function openAdd() {
    resetEditor();
    setEditor({ mode: "add" });
    setNotice("");
  }

  function openEdit(item: RecordValue) {
    const medicine = medicineOf(item);
    setSelectedMedicine(medicine);
    setMedicineQuery(text(medicine.brand_name, ""));
    setMedicineResults([]);
    setForm({
      stock_status: String(item.stock_status ?? "IN_STOCK").toUpperCase(),
      quantity: item.quantity === null || item.quantity === undefined ? "" : String(item.quantity),
      price: item.unit_price_centimes === null || item.unit_price_centimes === undefined ? "" : String(Number(item.unit_price_centimes) / 100),
      image_url: text(item.image_url, ""),
    });
    setAttributes(attributesOf(item));
    setEditor({ mode: "edit", item });
    setNotice("");
    setError("");
  }

  async function searchMedicines(value: string) {
    setMedicineQuery(value);
    if (!selectedMedicine || text(selectedMedicine.brand_name, "") !== value) setSelectedMedicine(null);
    if (value.trim().length < 2) {
      setMedicineResults([]);
      return;
    }
    setSearching(true);
    try {
      setMedicineResults(records(await api.medicinesSearch(value.trim(), 10)));
    } catch {
      setMedicineResults([]);
    } finally {
      setSearching(false);
    }
  }

  function chooseMedicine(medicine: RecordValue) {
    setSelectedMedicine(medicine);
    setMedicineQuery(text(medicine.brand_name, ""));
    setMedicineResults([]);
  }

  async function pickImage(file: File | undefined) {
    if (!file) return;
    setImageBusy(true);
    setError("");
    try {
      const dataUrl = await compressImageFile(file);
      setForm((current) => ({ ...current, image_url: dataUrl }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to read this picture.");
    } finally {
      setImageBusy(false);
    }
  }

  function updateAttribute(index: number, patch: Partial<AttributeRow>) {
    setAttributes((rows) => rows.map((row, position) => position === index ? { ...row, ...patch } : row));
  }

  async function saveStock(event: FormEvent) {
    event.preventDefault();
    if (!selectedMedicine?.id) {
      setError("Search and select a medicine first.");
      return;
    }
    const quantity = form.quantity.trim() === "" ? null : Number(form.quantity);
    if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0)) {
      setError("Quantity must be a whole number of zero or more.");
      return;
    }
    const price = form.price.trim() === "" ? null : Math.round(Number(form.price) * 100);
    if (price !== null && (!Number.isInteger(price) || price < 0)) {
      setError("Enter a valid unit price.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const cleanAttributes = Object.fromEntries(
        attributes
          .filter((row) => row.key.trim() && row.value.trim())
          .map((row) => [row.key.trim(), row.value.trim()]),
      );
      await api.pharmacyPutStock(String(selectedMedicine.id), {
        stock_status: form.stock_status as "IN_STOCK" | "LOW" | "OUT_OF_STOCK",
        quantity,
        unit_price_centimes: price,
        image_url: form.image_url.trim() || null,
        attributes: cleanAttributes,
      });
      setNotice(editor?.mode === "edit" ? "Stock line updated." : "Medicine added to your stock.");
      resetEditor();
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save this stock line.");
    } finally {
      setSaving(false);
    }
  }

  async function removeStock(item: RecordValue) {
    const medicine = medicineOf(item);
    if (!window.confirm(`Remove ${text(medicine.brand_name, "this medicine")} from your stock?`)) return;
    setError("");
    try {
      await api.pharmacyDeleteStock(String(medicine.id));
      setNotice("Stock line removed.");
      load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to remove this stock line.");
    }
  }

  const selectedImage = selectedMedicine ? stockImage({ image_url: form.image_url, medicine: selectedMedicine }) : "/medicine-box.svg";

  return (
    <PlatformShell role="pharmacy" title="Stock management">
      <div className="welcome-strip">
        <div>
          <span className="platform-kicker">PHARMACY SPACE</span>
          <h2>Your stock</h2>
          <p>Every medicine has its own picture, availability, price and specific details.</p>
        </div>
        <button className="platform-primary" type="button" onClick={openAdd}><Icon name="plus" size={16} /> Add medicine</button>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <div className="form-success" role="status">{notice}</div>}

      <div className="stock-summary">
        <div><span className="stock-summary-icon is-teal"><Icon name="store" size={18} /></span><div><strong>{items.length}</strong><span>Stock lines</span></div></div>
        <div><span className="stock-summary-icon is-green"><Icon name="shield" size={18} /></span><div><strong>{inStock}</strong><span>In stock</span></div></div>
        <div><span className="stock-summary-icon is-amber"><Icon name="bell" size={18} /></span><div><strong>{low}</strong><span>Low stock</span></div></div>
        <div><span className="stock-summary-icon is-red"><Icon name="file" size={18} /></span><div><strong>{out}</strong><span>Out of stock</span></div></div>
        <div className="stock-summary-value"><strong>{money(inventoryValue)}</strong><span>Inventory value</span></div>
      </div>

      <section className="platform-panel stock-panel">
        <div className="panel-title stock-panel-title">
          <div><span className="platform-kicker">INVENTORY</span><h3>Medicine catalogue</h3></div>
          <button className="platform-secondary" type="button" onClick={load} disabled={loading}>Refresh</button>
        </div>

        <div className="stock-toolbar">
          <label className="table-search stock-search">
            <Icon name="search" size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, DCI or manufacturer..." />
          </label>
          <div className="delivery-filters stock-filters">
            {[{ id: "ALL", label: "All", count: items.length }, ...STATUS_OPTIONS.map((option) => ({ ...option, count: items.filter((item) => String(item.stock_status).toUpperCase() === option.id).length }))].map((option) => (
              <button className={`delivery-filter${statusFilter === option.id ? " is-active" : ""}`} type="button" key={option.id} onClick={() => setStatusFilter(option.id)}>
                {option.label}<b>{option.count}</b>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="panel-copy">Loading your stock...</p>
        ) : visible.length === 0 ? (
          <div className="delivery-empty">
            <Icon name="store" size={22} />
            <h4>{items.length ? "No medicine matches" : "Your stock is empty"}</h4>
            <p className="panel-copy">{items.length ? "Try another search or status filter." : "Add your first medicine with a picture, price and its own details."}</p>
            {items.length ? <button className="platform-secondary" type="button" onClick={() => { setQuery(""); setStatusFilter("ALL"); }}>Clear filters</button> : <button className="platform-primary" type="button" onClick={openAdd}><Icon name="plus" size={16} /> Add medicine</button>}
          </div>
        ) : (
          <div className="stock-grid">
            {visible.map((item) => {
              const medicine = medicineOf(item);
              const status = statusMeta(item.stock_status);
              const attributes = attributesOf(item);
              return (
                <article className="stock-card" data-status={String(item.stock_status).toUpperCase()} key={text(medicine.id, text(medicine.brand_name))}>
                  <div className="stock-card-image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={stockImage(item)} alt={text(medicine.brand_name, "Medicine")} onError={(event) => { event.currentTarget.src = "/medicine-box.svg"; }} />
                    <span className="stock-card-status"><StatusBadge tone={status.tone}>{status.label}</StatusBadge></span>
                    {medicine.requires_prescription ? <span className="stock-card-rx">Rx</span> : null}
                  </div>
                  <div className="stock-card-body">
                    <span className="stock-card-category">{text(medicine.category, "Medicine").replaceAll("_", " ").toLowerCase()}</span>
                    <h3>{text(medicine.brand_name, "Medicine")}</h3>
                    <p className="stock-card-sub">{[medicine.form, medicine.dosage, medicine.pack_size].filter(Boolean).map((value) => String(value)).join(" · ") || text(medicine.inn_dci, "Details not specified")}</p>
                    <div className="stock-card-numbers">
                      <div><span>Quantity</span><strong>{text(item.quantity, "—")}</strong></div>
                      <div><span>Unit price</span><strong>{money(item.unit_price_centimes)}</strong></div>
                    </div>
                    {attributes.length ? (
                      <div className="stock-attribute-chips">
                        {attributes.slice(0, 5).map((attribute) => <span key={attribute.key}><b>{attribute.key}</b> {attribute.value}</span>)}
                        {attributes.length > 5 ? <span className="muted">+{attributes.length - 5}</span> : null}
                      </div>
                    ) : <p className="stock-card-empty-details">No specific details added yet.</p>}
                    <div className="stock-card-foot">
                      <small>Updated {date(item.updated_at)}</small>
                      <div>
                        <button className="table-action" type="button" onClick={() => openEdit(item)}>Edit</button>
                        <button className="stock-delete" type="button" onClick={() => removeStock(item)} aria-label="Remove stock line">×</button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {editor ? (
        <div className="order-modal-backdrop" onClick={() => { if (!saving) resetEditor(); }}>
          <div className="order-modal stock-modal" role="dialog" aria-modal="true" aria-labelledby="stock-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="order-modal-header">
              <div><span className="platform-kicker">{editor.mode === "edit" ? "EDIT STOCK LINE" : "ADD MEDICINE"}</span><h2 id="stock-modal-title">{editor.mode === "edit" ? text(medicineOf(editor.item ?? {}).brand_name, "Edit stock") : "Add to stock"}</h2></div>
              <button className="order-modal-close" type="button" aria-label="Close" onClick={resetEditor} disabled={saving}>×</button>
            </div>

            <form className="stock-form" onSubmit={saveStock}>
              <p className="panel-copy stock-modal-lead">{editor.mode === "edit" ? "Update availability, price and the picture patients see in your stock list." : "Choose a medicine, set its availability and price, then upload a real picture from your device."}</p>
              {editor.mode === "add" ? (
                <div className="stock-medicine-search">
                  <label>Find the medicine
                    <input value={medicineQuery} onChange={(event) => void searchMedicines(event.target.value)} placeholder="Start typing a brand name or DCI..." autoFocus />
                  </label>
                  {searching ? <p className="panel-copy">Searching the catalogue...</p> : null}
                  {!searching && medicineResults.length ? (
                    <div className="stock-search-results">
                      {medicineResults.map((medicine) => (
                        <button type="button" className="stock-search-result" key={text(medicine.id)} onClick={() => chooseMedicine(medicine)}>
                          <span className="stock-search-thumb">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={stockImage({ medicine })} alt="" />
                          </span>
                          <span><strong>{text(medicine.brand_name)}</strong><small>{[medicine.form, medicine.dosage, medicine.manufacturer].filter(Boolean).map((value) => String(value)).join(" · ")}</small></span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {selectedMedicine ? (
                    <div className="stock-selected">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selectedImage} alt="" />
                      <div><strong>{text(selectedMedicine.brand_name)}</strong><small>{[selectedMedicine.form, selectedMedicine.dosage, selectedMedicine.pack_size].filter(Boolean).map((value) => String(value)).join(" · ")}</small></div>
                      <StatusBadge tone="success">Selected</StatusBadge>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <span className="stock-form-label">Availability &amp; price</span>

              <div className="form-grid">
                <label>Stock status<select value={form.stock_status} onChange={(event) => setForm({ ...form, stock_status: event.target.value })}>{STATUS_OPTIONS.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>
                <label>Quantity<input type="number" min="0" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} placeholder="0" /></label>
                <label>Unit price (DZD)<input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="0.00" /></label>
              </div>

              <div className="stock-image-field">
                <div className="stock-image-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedImage} alt="Medicine preview" onError={(event) => { event.currentTarget.src = "/medicine-box.svg"; }} />
                </div>
                <div className="stock-image-copy">
                  <strong>Medicine picture</strong>
                  <p>Upload a photo from your device. It is resized and compressed automatically, then shown on your stock cards.</p>
                  <div className="stock-image-actions">
                    <label className="platform-secondary stock-upload-button">
                      <Icon name="file" size={15} /> {imageBusy ? "Preparing..." : form.image_url.startsWith("data:") ? "Replace picture" : "Upload picture"}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={imageBusy}
                        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void pickImage(file); }}
                      />
                    </label>
                    {form.image_url ? <button className="stock-image-remove" type="button" onClick={() => setForm({ ...form, image_url: "" })} disabled={imageBusy}>Remove</button> : null}
                  </div>
                  <small className="muted">JPG, PNG or WebP · a square picture looks best.</small>
                </div>
              </div>

              <div className="stock-attributes-editor">
                <div className="stock-attributes-head"><div><span className="platform-kicker">SPECIFIC DETAILS</span><p className="panel-copy">Add only what matters for this medicine, for example dosage, expiry, storage or pack size.</p></div><button className="platform-secondary" type="button" onClick={() => setAttributes((rows) => [...rows, { key: "", value: "" }])}>Add detail</button></div>
                {attributes.length === 0 ? <p className="stock-attributes-empty">No details yet. Use “Add detail” to describe this medicine.</p> : (
                  <div className="stock-attribute-rows">
                    {attributes.map((attribute, index) => (
                      <div className="stock-attribute-row" key={index}>
                        <input value={attribute.key} onChange={(event) => updateAttribute(index, { key: event.target.value })} placeholder="Label (e.g. Expiry)" />
                        <input value={attribute.value} onChange={(event) => updateAttribute(index, { value: event.target.value })} placeholder="Value (e.g. 2027-04)" />
                        <button type="button" onClick={() => setAttributes((rows) => rows.filter((_, position) => position !== index))} aria-label="Remove detail">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {editor.mode === "edit" && editor.item ? (
                <button className="stock-modal-remove" type="button" onClick={() => { const item = editor.item; resetEditor(); if (item) void removeStock(item); }}>Remove this stock line</button>
              ) : null}

              <div className="order-modal-actions">
                <button className="platform-secondary" type="button" onClick={resetEditor} disabled={saving}>Cancel</button>
                <button className="platform-primary" type="submit" disabled={saving || imageBusy || (editor.mode === "add" && !selectedMedicine)}>{saving ? "Saving..." : editor.mode === "edit" ? "Save changes" : "Add to stock"} <Icon name="arrow" size={15} /></button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </PlatformShell>
  );
}
