import type { ReactNode } from "react";

export function BatchGroup({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="mb-4">
            <p className="eyebrow mb-2">{title}</p>
            <div className="flex flex-col gap-1.5">{children}</div>
        </section>
    );
}
