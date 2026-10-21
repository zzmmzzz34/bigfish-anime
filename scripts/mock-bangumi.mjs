import http from 'node:http';

const item = {
  id: 1,
  name: '葬送のフリーレン',
  name_cn: '葬送的芙莉莲',
  summary:
    '勇者一行击败魔王后，精灵魔法使芙莉莲踏上了理解人类、收集回忆的旅程。这是测试用的中文简介，用于验证 Bangumi provider 的字段映射。',
  eps: 28,
  date: '2023-09-29',
  rating: { score: 8.9, rank: 42, total: 10000 },
  tags: [{ name: '奇幻' }, { name: '冒险' }],
};

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, 'http://127.0.0.1:9099');
  if (url.pathname === '/v0/search/subjects') {
    res.end(JSON.stringify({ data: [item], total: 1 }));
    return;
  }
  if (url.pathname.startsWith('/v0/subjects/')) {
    const id = url.pathname.split('/').pop();
    if (id === '253') {
      res.end(JSON.stringify({ id: 253, name: 'CLANNAD', name_cn: 'CLANNAD', rating: { score: 8.5 } }));
      return;
    }
    res.end(JSON.stringify({ ...item, id: Number(id) || 1 }));
    return;
  }
  res.statusCode = 404;
  res.end('{}');
});

server.listen(9099, '127.0.0.1', () => console.log('mock bangumi on 9099'));
