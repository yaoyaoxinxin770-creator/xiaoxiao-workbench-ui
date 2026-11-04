import justifiedLayout from "justified-layout";

export type GalleryItem = { id: string; video?: { width: number; height: number }; size: string };
export function videoAspect(item: GalleryItem) {
    if (item.video?.width && item.video.height) return item.video.width / item.video.height;
    const values = item.size.split(/[x×:]/).map(Number);
    return values.length === 2 && values.every(v => Number.isFinite(v) && v > 0) ? values[0] / values[1] : 16 / 9;
}
export function galleryRows(items: GalleryItem[], width: number, columns: number, square: boolean) {
    if (!items.length || width <= 0) return { rows: [], height: 0 };
    const ratios = items.map(videoAspect);
    const average = ratios.slice(0, 40).reduce((sum, ratio) => sum + ratio, 0) / Math.min(40, ratios.length);
    const count = Math.min(columns, Math.max(1, Math.floor(width / 150)));
    const geometry = justifiedLayout(ratios, { containerWidth: width, containerPadding: 0, boxSpacing: 3,
        targetRowHeight: (width - 3 * (count - 1)) / count / (square ? 1 : average),
        targetRowHeightTolerance: 0.15, forceAspectRatio: square ? 1 : false, showWidows: true });
    const rows: { top: number; height: number; boxes: { index: number; left: number; width: number; height: number }[] }[] = [];
    geometry.boxes.forEach((box, index) => {
        let row = rows.at(-1);
        if (!row || Math.abs(row.top - box.top) > 1) { row = { top: box.top, height: box.height + 3, boxes: [] }; rows.push(row); }
        row.boxes.push({ index, left: box.left, width: box.width, height: box.height });
    });
    return { rows, height: geometry.containerHeight };
}
