export type PromptSnapshot<T=undefined> = { text: string; caret: number; context?:T };

export function createPromptHistory<T=undefined>(text: string, caret = text.length, context?:T, sameContext:(a:T|undefined,b:T|undefined)=>boolean=(a,b)=>a===b) {
    const make=(text:string,caret:number,context?:T):PromptSnapshot<T>=>({text,caret,...(context===undefined?{}:{context})});
    let snapshots: PromptSnapshot<T>[] = [make(text,caret,context)], index = 0, lastTime = 0, lastDirection = 0;
    const current = () => snapshots[index];
    const breakGroup = () => { lastTime = 0; lastDirection = 0; };
    return {
        current,
        rememberCaret(caret: number) { current().caret = caret; },
        push(text: string, caret: number, force = false, now = Date.now(),context=current().context) {
            const previous = current();
            if (previous.text === text && sameContext(previous.context,context)) { previous.caret = caret; return; }
            const branched = index < snapshots.length - 1;
            snapshots = snapshots.slice(0, index + 1);
            const delta = text.length - previous.text.length, direction = Math.sign(delta);
            const editAt = Math.min(caret, previous.caret);
            const changed = delta > 0 ? text.slice(editAt, editAt + delta) : previous.text.slice(editAt, editAt - delta);
            const adjacent = caret - previous.caret === delta || delta === -1 && caret === previous.caret;
            const merge = sameContext(previous.context,context) && !force && !branched && index > 0 && direction === lastDirection && adjacent && Math.abs(delta) === 1 && now - lastTime < 500 && !/[\s，。！？,.!?]/.test(changed);
            if (merge) snapshots[index] = make(text,caret,context);
            else { snapshots.push(make(text,caret,context)); if (snapshots.length > 100) snapshots.shift(); index = snapshots.length - 1; }
            lastTime = force ? 0 : now; lastDirection = force ? 0 : direction;
        },
        undo() { breakGroup(); return index > 0 ? snapshots[--index] : null; },
        redo() { breakGroup(); return index < snapshots.length - 1 ? snapshots[++index] : null; },
    };
}
