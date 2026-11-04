// Agent 回复的提示词修改对比：先按行比较，再对成对修改的行做逐字比较。
// 只用于展示，不参与回填、提交或任何业务判断；比较失败时调用方直接展示全文。

export type DiffSpan = { text: string; changed: boolean };
export type DiffLine = { kind: "same" | "add" | "del"; text: string; spans?: DiffSpan[] };
export type DiffBlock = DiffLine | { kind: "skip"; count: number };

const MAX_LINE_CELLS = 250_000;
const MAX_CHAR_CELLS = 160_000;

function lcsOps<T>(a: T[], b: T[]): ("same" | "del" | "add")[] | null {
    const n = a.length,
        m = b.length;
    if (n * m > MAX_LINE_CELLS) return null;
    const table: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    const ops: ("same" | "del" | "add")[] = [];
    let i = 0,
        j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) {
            ops.push("same");
            i++;
            j++;
        } else if (table[i + 1][j] >= table[i][j + 1]) {
            ops.push("del");
            i++;
        } else {
            ops.push("add");
            j++;
        }
    }
    while (i++ < n) ops.push("del");
    while (j++ < m) ops.push("add");
    return ops;
}

function spans(chars: string[], marks: boolean[]): DiffSpan[] {
    const out: DiffSpan[] = [];
    chars.forEach((ch, index) => {
        const last = out[out.length - 1];
        if (last && last.changed === marks[index]) last.text += ch;
        else out.push({ text: ch, changed: marks[index] });
    });
    return out;
}

/** 逐字比较一对修改前后的行，返回两侧带标记的片段；过长时整行标记为修改。 */
export function diffLineChars(before: string, after: string): { del: DiffSpan[]; add: DiffSpan[] } {
    const a = Array.from(before),
        b = Array.from(after);
    if (a.length * b.length > MAX_CHAR_CELLS) return { del: [{ text: before, changed: true }], add: [{ text: after, changed: true }] };
    const ops = lcsOps(a, b) || [];
    const delMarks: boolean[] = [],
        addMarks: boolean[] = [];
    for (const op of ops) {
        if (op === "same") {
            delMarks.push(false);
            addMarks.push(false);
        } else if (op === "del") delMarks.push(true);
        else addMarks.push(true);
    }
    return { del: spans(a, delMarks), add: spans(b, addMarks) };
}

/**
 * 比较修改前后的提示词。返回空数组表示两者相同；返回 null 表示内容过长、放弃比较。
 * 未改动的行只在修改处前后各保留 context 行，其余折叠为 skip。
 */
export function diffPromptLines(before: string, after: string, context = 1): DiffBlock[] | null {
    const a = before.replace(/\r\n?/g, "\n").split("\n"),
        b = after.replace(/\r\n?/g, "\n").split("\n");
    if (a.join("\n") === b.join("\n")) return [];
    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) head++;
    let tail = 0;
    while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
    const midA = a.slice(head, a.length - tail),
        midB = b.slice(head, b.length - tail);
    const midOps = lcsOps(midA, midB);
    if (!midOps) return null;
    const lines: DiffLine[] = a.slice(0, head).map((text) => ({ kind: "same" as const, text }));
    let ia = 0,
        ib = 0;
    for (let k = 0; k < midOps.length; ) {
        if (midOps[k] === "same") {
            lines.push({ kind: "same", text: midA[ia++] });
            ib++;
            k++;
            continue;
        }
        const dels: string[] = [],
            adds: string[] = [];
        while (k < midOps.length && midOps[k] !== "same") {
            if (midOps[k] === "del") dels.push(midA[ia++]);
            else adds.push(midB[ib++]);
            k++;
        }
        const paired = Math.min(dels.length, adds.length);
        for (let p = 0; p < paired; p++) {
            const chars = diffLineChars(dels[p], adds[p]);
            lines.push({ kind: "del", text: dels[p], spans: chars.del });
            lines.push({ kind: "add", text: adds[p], spans: chars.add });
        }
        for (const text of dels.slice(paired)) lines.push({ kind: "del", text });
        for (const text of adds.slice(paired)) lines.push({ kind: "add", text });
    }
    lines.push(...a.slice(a.length - tail).map((text) => ({ kind: "same" as const, text })));
    const keep = lines.map(() => false);
    lines.forEach((line, index) => {
        if (line.kind === "same") return;
        for (let d = -context; d <= context; d++) if (lines[index + d]) keep[index + d] = true;
    });
    const blocks: DiffBlock[] = [];
    let skipped = 0;
    lines.forEach((line, index) => {
        if (keep[index]) {
            if (skipped) blocks.push({ kind: "skip", count: skipped });
            skipped = 0;
            blocks.push(line);
        } else skipped++;
    });
    if (skipped) blocks.push({ kind: "skip", count: skipped });
    return blocks;
}

/** 统计新增、删除的行数，供对比标题显示。 */
export function diffStats(blocks: DiffBlock[]): { added: number; removed: number } {
    return blocks.reduce((sum, block) => ({ added: sum.added + (block.kind === "add" ? 1 : 0), removed: sum.removed + (block.kind === "del" ? 1 : 0) }), { added: 0, removed: 0 });
}
