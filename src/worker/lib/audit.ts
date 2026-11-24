// 后台操作日志（t_log）：谁、从哪个 IP、什么时候、做了什么
// 之前库里这张表只有旧站残留数据、没人写入，后台"数据统计 → 操作日志"永远是空的
import type { Context } from "hono";
import type { AppEnv, AdminVariables } from "../env";
import { nowSql } from "./auth";
import { exec } from "./d1";
import { clientIp } from "./security";

type Ctx = Context<{ Bindings: AppEnv; Variables: AdminVariables }>;

/** 记一条操作日志；日志本身失败绝不能影响业务请求，所以全部吞异常 */
export async function audit(c: Ctx, action: string): Promise<void> {
	try {
		const admin = c.get("admin");
		const siteId = c.get("siteId");
		const who = admin?.UserName ?? "?";
		await exec(
			c.env.DB.prepare('INSERT INTO t_log ("SiteId","IP","Time","Description") VALUES (?,?,?,?)'),
			Number(siteId ?? 0),
			clientIp(c).slice(0, 45),
			nowSql(),
			`${who} ${action}`.slice(0, 300),
		);
	} catch {
		/* 日志失败不影响主流程 */
	}
}
