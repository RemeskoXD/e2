import nodemailer from "nodemailer";

export type OrderEmailLine = {
  title: string;
  width_mm: number;
  height_mm: number;
  quantity: number;
  line_total_czk: number;
};

/** Odeslání potvrzení zákazníkovi a kopie obchodu — zapne se jen při nastaveném SMTP_HOST. */
export async function sendOrderEmails(params: {
  orderNo: string;
  customerName: string;
  customerEmail: string;
  totalCzk: number;
  itemsCount: number;
  lines: OrderEmailLine[];
}): Promise<void> {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return;

  const port = Number(process.env.SMTP_PORT) || 587;
  const secure =
    process.env.SMTP_SECURE === "1" ||
    process.env.SMTP_SECURE === "true" ||
    port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.MAIL_FROM?.trim() || user || "noreply@localhost";

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  const linesText = params.lines
    .map(
      (l) =>
        `  - ${l.title} ${l.width_mm}×${l.height_mm} mm, ${l.quantity} ks — ${l.line_total_czk} Kč bez DPH`
    )
    .join("\n");

  const customerBody = `Objednávka ${params.orderNo}

Dobrý den ${params.customerName},

potvrzujeme přijetí objednávky.

Celkem bez DPH: ${params.totalCzk} Kč
Položek: ${params.itemsCount}

${linesText}

Brzy vás kontaktujeme.

— Qapi`;

  const shopTo = process.env.MAIL_TO_SHOP?.trim();

  try {
    await transporter.sendMail({
      from,
      to: params.customerEmail,
      subject: `Potvrzení objednávky ${params.orderNo}`,
      text: customerBody,
    });
    if (shopTo) {
      await transporter.sendMail({
        from,
        to: shopTo,
        subject: `[Qapi] Nová objednávka ${params.orderNo}`,
        text: `Nová objednávka ${params.orderNo}
${params.customerName} <${params.customerEmail}>
${params.totalCzk} Kč bez DPH

${linesText}`,
      });
    }
  } catch (e) {
    console.warn("[order-email]", e);
  }
}
