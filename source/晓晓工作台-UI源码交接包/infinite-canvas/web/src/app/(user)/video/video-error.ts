// Preserve diagnostic details separately from the compact gallery message.
export function cleanVideoError(text: string) {
    if(/ExceedConcurrencyLimit|超出并发|并发.*超限/i.test(text))return "即梦当前并发任务已满，本次请求被拒绝。请等待已有任务结束后再提交。";
    return text.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "");
}
export function videoCardError(text: string) {
    const cleaned = cleanVideoError(text);
    if (cleaned.includes("小云雀") && cleaned.includes("视频素材信息缺失")) return "小云雀未能识别参考视频信息。点开详情查看错误。";
    if(cleaned.includes("The service rejected the request as invalid"))return cleaned.includes("计算视频积分")?"即梦计算积分时拒绝了请求。点开详情查看错误编号。":cleaned.includes("保存视频节点")?"即梦未能保存本次视频节点，请查看详情核对参数与素材状态。":"即梦未接受本次请求。点开详情核对参数与素材状态。";
    return cleaned || "没有可显示的视频";
}
