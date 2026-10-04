// Серверный ИИ-совет тренера. В отличие от версии внутри Claude-артефакта, здесь используется
// ваш собственный ключ Anthropic API — поэтому работает на любом хостинге, для любого посетителя.
import dotenv from 'dotenv';
dotenv.config();

export async function getAdvice(playerStats, question) {
  const prompt = `Ты тренер по CS2 на FACEIT. Данные игрока: ${JSON.stringify(playerStats)}. ` +
    `Вопрос игрока: ${question || 'нет'}. Ответь по-русски: 1) как он играет на своей роли, ` +
    `2) три конкретных шага, что прокачать в первую очередь, 3) стоит ли менять роль или стиль. ` +
    `Опирайся только на эти цифры и не выдумывай данные, которых нет. До 200 слов, без вступления.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${body}`);
  }
  const data = await res.json();
  const text = (data.content || []).map(b => b.text || '').join('\n').trim();
  return text || 'Не получилось сформировать совет.';
}
