export function Divider({ className }: { className?: string }) {
  return <hr className={["ds-divider", className].filter(Boolean).join(" ")} />;
}
