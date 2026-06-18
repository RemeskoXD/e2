import type { Application, RequestHandler, Response } from "express";
import type { Pool } from "pg";

type WithDb = (res: Response, fn: (db: Pool) => Promise<void>) => Promise<void>;

const MAX_BODY_HTML = 500_000;

export function registerMeasureGuideRoutes(
  app: Application,
  withDb: WithDb,
  requireAdmin: RequestHandler,
  clipStr: (s: string, max: number) => string
): void {
  app.get("/api/measure-guide", async (req, res) => {
    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ error: "Database not configured" });
    }
    await withDb(res, async (db) => {
      try {
        const [page, sections] = await Promise.all([
          db.query(
            'SELECT id, eyebrow, title, intro, card_title, card_subtitle FROM "MeasureGuidePage" WHERE id = 1'
          ),
          db.query(
            'SELECT id, title, body_html, video_url, sort_order FROM "MeasureGuideSection" ORDER BY sort_order ASC, id ASC'
          ),
        ]);
        const fallbackPage = {
          id: 1,
          eyebrow: "MĚŘENÍ A PŘÍPRAVA",
          title: "Jak zaměřit před objednávkou",
          intro: "Přesný postup pro čistý montážní otvor.",
          card_title: "Krok za krokem (přehled)",
          card_subtitle:
            "Stejný princip platí pro rolety, žaluzie i vrata — liší se jen detaily u těsnění a vedení kabelů.",
        };
        res.json({
          page: page.rows[0] ?? fallbackPage,
          sections: sections.rows,
        });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.put("/api/admin/measure-guide/page", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const b = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
        const eyebrow = clipStr(String(b.eyebrow ?? ""), 255);
        const title = clipStr(String(b.title ?? ""), 500);
        const intro = clipStr(String(b.intro ?? ""), 4000);
        const card_title = clipStr(String(b.card_title ?? ""), 500);
        const card_subtitle = clipStr(String(b.card_subtitle ?? ""), 8000);
        await db.query(
          `INSERT INTO "MeasureGuidePage" (id, eyebrow, title, intro, card_title, card_subtitle, updated_at)
           VALUES (1, $1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             eyebrow = EXCLUDED.eyebrow,
             title = EXCLUDED.title,
             intro = EXCLUDED.intro,
             card_title = EXCLUDED.card_title,
             card_subtitle = EXCLUDED.card_subtitle,
             updated_at = CURRENT_TIMESTAMP`,
          [eyebrow, title, intro, card_title, card_subtitle]
        );
        const r = await db.query('SELECT * FROM "MeasureGuidePage" WHERE id = 1');
        res.json(r.rows[0]);
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.post("/api/admin/measure-guide/sections", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const b = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
        const title = clipStr(String(b.title ?? "Nová sekce"), 500);
        const body_html = String(b.body_html ?? "");
        if (body_html.length > MAX_BODY_HTML) {
          res.status(400).json({ error: "Text sekce je příliš dlouhý." });
          return;
        }
        const videoRaw = b.video_url != null ? String(b.video_url).trim() : "";
        const video_url = videoRaw ? clipStr(videoRaw, 2000) : null;
        const max = await db.query(
          'SELECT COALESCE(MAX(sort_order), -1)::int AS m FROM "MeasureGuideSection"'
        );
        const sort_order = (max.rows[0] as { m: number }).m + 1;
        const ins = await db.query(
          `INSERT INTO "MeasureGuideSection" (title, body_html, video_url, sort_order)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [title, body_html, video_url, sort_order]
        );
        res.status(201).json(ins.rows[0]);
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.put("/api/admin/measure-guide/sections/:id", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id < 1) {
          res.status(400).json({ error: "Neplatné ID" });
          return;
        }
        const b = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
        const title = clipStr(String(b.title ?? ""), 500);
        const body_html = String(b.body_html ?? "");
        if (body_html.length > MAX_BODY_HTML) {
          res.status(400).json({ error: "Text sekce je příliš dlouhý." });
          return;
        }
        const videoRaw = b.video_url != null ? String(b.video_url).trim() : "";
        const video_url = videoRaw ? clipStr(videoRaw, 2000) : null;
        const result = await db.query(
          `UPDATE "MeasureGuideSection" SET title = $1, body_html = $2, video_url = $3 WHERE id = $4 RETURNING *`,
          [title, body_html, video_url, id]
        );
        if (!result.rows[0]) {
          res.status(404).json({ error: "Not found" });
          return;
        }
        res.json(result.rows[0]);
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.delete("/api/admin/measure-guide/sections/:id", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      try {
        const id = Number(req.params.id);
        await db.query('DELETE FROM "MeasureGuideSection" WHERE id = $1', [id]);
        res.json({ success: true });
      } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Server error" });
      }
    });
  });

  app.put("/api/admin/measure-guide/sections/reorder", requireAdmin, async (req, res) => {
    await withDb(res, async (db) => {
      const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
      const orderedIds = body.orderedIds;
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        res.status(400).json({ error: "orderedIds musí být neprázdné pole id" });
        return;
      }
      const ids = orderedIds
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (ids.length !== orderedIds.length) {
        res.status(400).json({ error: "Neplatná id v orderedIds" });
        return;
      }
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        for (let i = 0; i < ids.length; i++) {
          await client.query('UPDATE "MeasureGuideSection" SET sort_order = $1 WHERE id = $2', [i, ids[i]]);
        }
        await client.query("COMMIT");
        res.json({ ok: true });
      } catch (e) {
        await client.query("ROLLBACK");
        console.error(e);
        res.status(500).json({ error: "Server error" });
      } finally {
        client.release();
      }
    });
  });
}
