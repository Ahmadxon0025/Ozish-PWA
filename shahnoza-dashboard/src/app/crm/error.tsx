"use client";

export default function CrmError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <p className="text-destructive font-medium">Xatolik yuz berdi</p>
      <p className="text-muted-foreground text-sm">{error.message}</p>
      <button onClick={reset} className="text-sm underline">
        Qayta urinish
      </button>
    </div>
  );
}
