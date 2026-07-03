import { Eyebrow, MotionList, MotionItem } from "@cura/ui";
import { useAuth } from "../state/auth.js";

/** Org / security / retention settings (read model; edits gated by role). */
export function SettingsRoute() {
  const { identity } = useAuth();
  return (
    <div className="max-w-xl space-y-6">
      <Eyebrow>Settings</Eyebrow>
      <MotionList as="dl" className="divide-y divide-line rounded-lg border border-line">
        <Row label="Organization" value={identity?.orgId ?? "—"} />
        <Row label="Signed in as" value={identity ? `${identity.userId} (${identity.role})` : "—"} />
        <Row label="Permissions" value={identity?.permissions.join(", ") ?? "—"} />
        <Row label="Data retention" value="Honors organization retention policy" />
      </MotionList>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <MotionItem as="div" className="flex items-start justify-between gap-6 px-5 py-4 transition-colors hover:bg-bg-700/20">
      <dt className="text-sm text-text-lo">{label}</dt>
      <dd className="text-right text-sm text-text-hi">{value}</dd>
    </MotionItem>
  );
}
