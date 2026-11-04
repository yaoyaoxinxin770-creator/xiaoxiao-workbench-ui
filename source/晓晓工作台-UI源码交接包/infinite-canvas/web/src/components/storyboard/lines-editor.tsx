"use client";

export function LinesEditor({ lines, onChange, compact, placeholder = "文案行（回车新增一行）" }: {
    lines: string[];
    onChange: (next: string[]) => void;
    compact?: boolean;
    placeholder?: string;
}) {
    const rows = lines.length ? lines : [""];
    const commit = (next: string[]) => onChange(next);

    return (
        <div className="flex flex-col gap-1">
            {rows.map((line, index) => (
                <div
                    key={index}
                    className={`rounded-md border border-border bg-background/60 px-2.5 transition focus-within:border-primary ${compact ? "py-0.5" : "py-1"}`}
                >
                    <input
                        value={line}
                        placeholder={index === 0 ? placeholder : ""}
                        className={`w-full border-0 bg-transparent p-0 text-foreground outline-none ${compact ? "text-xs" : "text-sm"}`}
                        onChange={(event) => {
                            const next = [...rows];
                            next[index] = event.target.value;
                            commit(next.filter((item, i) => item !== "" || i === 0));
                        }}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                const next = [...rows];
                                next.splice(index + 1, 0, "");
                                commit(next);
                            } else if (event.key === "Backspace" && !line && rows.length > 1) {
                                event.preventDefault();
                                commit(rows.filter((_, i) => i !== index));
                            }
                        }}
                    />
                </div>
            ))}
        </div>
    );
}
