import { Field, Input, Select } from '@/components/ui/Field';
import type { MetadataFieldView } from '@/lib/api/types';

export type MetadataValues = Record<string, string>;

/**
 * Client-side mirror of the server's metadata validation (MetadataService). The server remains the
 * authority; its field errors are shown the same way.
 */
export function validateMetadata(fields: MetadataFieldView[], values: MetadataValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = (values[f.key] ?? '').trim();
    if (!v) {
      if (f.required) errors[f.key] = `${f.label} is required`;
      continue;
    }
    const ok = {
      TEXT: () => v.length <= 1000,
      NUMBER: () => !Number.isNaN(Number(v)),
      DATE: () => /^\d{4}-\d{2}-\d{2}$/.test(v),
      BOOLEAN: () => v === 'true' || v === 'false',
      ENUM: () => f.allowedValues.includes(v),
    }[f.dataType]();
    if (!ok) {
      errors[f.key] = {
        TEXT: 'Use at most 1000 characters',
        NUMBER: 'Enter a number',
        DATE: 'Enter a date',
        BOOLEAN: 'Choose yes or no',
        ENUM: 'Choose one of the listed values',
      }[f.dataType];
    }
  }
  return errors;
}

/** Only non-empty values are sent; an empty optional field means "not recorded". */
export function compactMetadata(values: MetadataValues): MetadataValues {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ''));
}

export function MetadataFields({ fields, values, errors, onChange }: {
  fields: MetadataFieldView[];
  values: MetadataValues;
  errors: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  if (!fields.length) return null;
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 text-[13px] font-medium text-ink">Document details</legend>
      {fields.map((f) => (
        <Field key={f.key} label={f.required ? f.label : `${f.label} (optional)`} error={errors[f.key]}>
          {(a) =>
            f.dataType === 'ENUM' ? (
              <Select {...a} value={values[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value)}>
                <option value="">Choose…</option>
                {f.allowedValues.map((v) => <option key={v} value={v}>{v}</option>)}
              </Select>
            ) : f.dataType === 'BOOLEAN' ? (
              <Select {...a} value={values[f.key] ?? ''} onChange={(e) => onChange(f.key, e.target.value)}>
                <option value="">Not recorded</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            ) : (
              <Input
                {...a}
                type={f.dataType === 'DATE' ? 'date' : f.dataType === 'NUMBER' ? 'number' : 'text'}
                step={f.dataType === 'NUMBER' ? 'any' : undefined}
                value={values[f.key] ?? ''}
                onChange={(e) => onChange(f.key, e.target.value)}
              />
            )
          }
        </Field>
      ))}
    </fieldset>
  );
}
