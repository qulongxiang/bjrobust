// 图片上传的公共约束：扩展名白名单、体积上限、按文件头嗅探真实类型
export const ALLOWED_EXT: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".gif": "image/gif",
	".webp": "image/webp",
};

export const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/** 按文件头校验真实类型，避免只改扩展名的伪图片 */
export async function sniffImage(file: File): Promise<string | null> {
	const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
	const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
	if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
	if (ascii(0, 4) === "\x89PNG") return "image/png";
	if (ascii(0, 3) === "GIF") return "image/gif";
	if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
	return null;
}
