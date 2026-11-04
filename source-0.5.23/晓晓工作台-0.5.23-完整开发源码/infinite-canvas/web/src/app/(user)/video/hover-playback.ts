type Preview = { stop: () => void };
let active: Preview | null = null;
export function stopActivePreview() {
    active?.stop();
    active = null;
}
export function acquirePreview(stop: () => void) {
    active?.stop();
    let stopped = false;
    const preview = { stop: () => { if (stopped) return; stopped = true; stop(); } };
    active = preview;
    return () => { if (active === preview) active = null; preview.stop(); };
}
