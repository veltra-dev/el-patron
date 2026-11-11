import { CATEGORY_LABELS, EXPENSE_CATEGORIES } from "@elpatron/shared";

export function CategorySelect({ name = "category", defaultValue, exclude = [] }: { name?: string; defaultValue?: string; exclude?: string[] }) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} required className="input">
      <option value="" disabled>
        Escolha…
      </option>
      {EXPENSE_CATEGORIES.filter((c) => !exclude.includes(c)).map((c) => (
        <option key={c} value={c}>
          {CATEGORY_LABELS[c]}
        </option>
      ))}
    </select>
  );
}
