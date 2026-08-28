export async function GET() {
  return new Response("certId,status,validFrom,validUntil", {
    headers: { "content-type": "text/csv" },
  });
}