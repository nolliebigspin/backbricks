import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import type * as React from 'react';

import { Button } from '#components/button';

export type FieldListEditorLabels = {
  /** Accessible name of the list. */
  list: string;
  edit: (name: string) => string;
  moveUp: (name: string) => string;
  moveDown: (name: string) => string;
  remove: (name: string) => string;
};

/**
 * Ordered list of fields with up/down buttons instead of drag-and-drop (keyboard and phone
 * friendly), one expandable editor per field and a caller-supplied control to add fields. The
 * caller owns the items and decides what a field is; this only orders, expands and removes.
 */
export function FieldListEditor<T>({
  items,
  getId,
  getName,
  renderSummary,
  renderEditor,
  onChange,
  renderAdd,
  labels,
  disabled = false,
}: {
  items: readonly T[];
  getId: (item: T) => string;
  /** Plain-text name for button labels. */
  getName: (item: T) => string;
  /** Short line under the name, e.g. the type and "required". */
  renderSummary: (item: T) => React.ReactNode;
  renderEditor: (item: T, index: number) => React.ReactNode;
  onChange: (items: T[]) => void;
  /** Rendered after the list; calling `add` appends the item and opens its editor. */
  renderAdd?: (add: (item: T) => void) => React.ReactNode;
  labels: FieldListEditorLabels;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    if (item === undefined) return;
    next.splice(to, 0, item);
    onChange(next);
  };
  return (
    <div className="space-y-4">
      <ol aria-label={labels.list} className="divide-y rounded-lg border bg-background">
        {items.map((item, index) => {
          const id = getId(item);
          const name = getName(item);
          const open = expanded.has(id);
          const editorId = `field-editor-${id}`;
          return (
            <li key={id} className="space-y-4 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 text-left underline-offset-4 hover:underline focus-visible:underline"
                  aria-expanded={open}
                  aria-controls={editorId}
                  aria-label={labels.edit(name)}
                  onClick={() => toggle(id)}
                >
                  <span className="block font-medium break-words">{name}</span>
                  <span className="block text-sm text-muted-foreground">{renderSummary(item)}</span>
                </button>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={labels.moveUp(name)}
                    disabled={disabled || index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={labels.moveDown(name)}
                    disabled={disabled || index === items.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={labels.remove(name)}
                    disabled={disabled}
                    onClick={() => onChange(items.filter((_, position) => position !== index))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
              {open && <div id={editorId}>{renderEditor(item, index)}</div>}
            </li>
          );
        })}
      </ol>
      {renderAdd?.((item) => {
        onChange([...items, item]);
        setExpanded((current) => new Set(current).add(getId(item)));
      })}
    </div>
  );
}
