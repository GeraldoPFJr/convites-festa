type PublicInvite = {
  settings?: { festaNome?: string; data?: string; local?: string; imagemUrl?: string }
  invite?: { token?: string; titulo?: string; tipo?: string; nomeManual?: boolean }
  guests?: { nome?: string }[]
}

const APP_URL = 'https://geraldopfjr.github.io/convites-festa/'
const SOCIAL_BOT = /facebookexternalhit|whatsapp|twitterbot|linkedinbot|slackbot|telegrambot|discordbot/i

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]!)
}

function inviteName(data: PublicInvite) {
  const invite = data.invite
  if (!invite) return 'Você foi convidado'
  if (invite.tipo === 'individual' || invite.nomeManual) return invite.titulo || 'Você foi convidado'
  const first = data.guests?.[0]?.nome?.trim().split(/\s+/)[0]
  return first ? `Família ${first}` : invite.titulo || 'Você foi convidado'
}

async function getInvite(token: string): Promise<PublicInvite | null> {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !key) return null
  const response = await fetch(`${url}/rest/v1/rpc/public_invite_details`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  })
  return response.ok ? await response.json() : null
}

Deno.serve(async (request) => {
  const url = new URL(request.url)
  const token = url.searchParams.get('token')?.trim() || ''
  if (!token) return new Response('Convite não encontrado', { status: 404 })
  const invite = await getInvite(token)
  if (!invite?.invite) return new Response('Convite não encontrado', { status: 404 })

  const imageUrl = invite.settings?.imagemUrl || ''
  if (url.searchParams.get('image') === '1') {
    const dataUrl = imageUrl.match(/^data:([^;,]+);base64,(.+)$/)
    if (dataUrl) {
      const binary = atob(dataUrl[2])
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
      return new Response(bytes, { headers: { 'content-type': dataUrl[1], 'cache-control': 'public, max-age=3600' } })
    }
    if (/^https?:\/\//i.test(imageUrl)) return Response.redirect(imageUrl, 302)
    return new Response('Imagem não encontrada', { status: 404 })
  }

  const openUrl = `${APP_URL}#/c/${encodeURIComponent(token)}`
  const previewUrl = `${url.origin}${url.pathname}?token=${encodeURIComponent(token)}`
  if (!SOCIAL_BOT.test(request.headers.get('user-agent') || '')) return Response.redirect(openUrl, 302)

  const party = invite.settings?.festaNome || 'Convite'
  const details = [invite.settings?.data, invite.settings?.local].filter(Boolean).join(' · ')
  const image = imageUrl ? `${previewUrl}&image=1` : ''
  const title = `${inviteName(invite)} · ${party}`
  const description = [details, 'Confirme sua presença.'].filter(Boolean).join(' — ')
  const metaImage = image ? `<meta property="og:image" content="${escapeHtml(image)}"><meta name="twitter:image" content="${escapeHtml(image)}">` : ''
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><meta property="og:type" content="website"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(previewUrl)}">${metaImage}<meta name="twitter:card" content="summary_large_image"></head><body>Convite para ${escapeHtml(party)}</body></html>`
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } })
})
