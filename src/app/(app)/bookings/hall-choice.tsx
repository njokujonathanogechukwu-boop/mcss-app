"use client";

/**
 * The parts of the hall a booking needs, ticked: one hall, or more for an
 * event that uses them together. Each ticked part posts under resourceId.
 */
export function HallChoice({
  resources, defaultIds = [], error, idPrefix = "hall",
}: {
  resources: { id: string; name: string }[];
  defaultIds?: string[];
  error?: string;
  /** Keeps the box ids apart when several forms are on the page. */
  idPrefix?: string;
}) {
  return (
    <fieldset>
      <legend className="field-label">Which part of the hall</legend>
      <div className="flex flex-wrap gap-2">
        {resources.map((r) => (
          <label
            key={r.id}
            htmlFor={`${idPrefix}-${r.id}`}
            className="flex cursor-pointer items-center gap-2 rounded border border-rule-strong bg-surface px-3 py-2 text-sm text-ink has-[:checked]:border-pine has-[:checked]:bg-pine-light"
          >
            <input
              id={`${idPrefix}-${r.id}`}
              type="checkbox"
              name="resourceId"
              value={r.id}
              defaultChecked={defaultIds.includes(r.id)}
              className="h-4 w-4 rounded-sm border-rule-strong text-pine focus:ring-pine"
            />
            {r.name}
          </label>
        ))}
      </div>
      {error ? (
        <p className="field-error">{error}</p>
      ) : (
        <p className="field-hint">Tick more than one for an event that uses both halls together.</p>
      )}
    </fieldset>
  );
}
