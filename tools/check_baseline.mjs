import { readFileSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const f = `${process.env.TEMP}\\baseline_test.sqlite`;
try { rmSync(f); } catch {}
const d = new DatabaseSync(f);
const raw = readFileSync("migrations/0001_baseline.sql", "utf8");
const stmts = raw
	.split(/;\s*\n/)
	.map((s) =>
		s
			.split(/\r?\n/)
			.filter((l) => !l.trim().startsWith("--"))
			.join("\n")
			.trim(),
	)
	.filter(Boolean);
let ok = 0;
for (const s of stmts) {
	try { d.exec(s + ";"); ok++; } catch (e) { console.log("FAIL:", e.message, "\n  near:", s.slice(0, 90)); }
}
const tables = d.prepare("SELECT count(*) c FROM sqlite_master WHERE type='table'").get().c;
const idx = d.prepare("SELECT count(*) c FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").get().c;
console.log("statements", stmts.length, "ok", ok, "tables", tables, "indexes", idx);
