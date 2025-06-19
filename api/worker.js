export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { articles, images, description, idioma } = req.body;
    if (!Array.isArray(articles)) {
      return res.status(400).json({ error: 'Formato inválido' });
    }

    let result;
    if (images === 'yes') {
      result = await fetchArticleImages(articles, idioma);
    } else if (description === 'yes') {
      result = await fetchArticleDescriptions(articles);
    } else {
      result = await checkArticlesInBatches(articles, 50, idioma);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

// 🔍 Verifica artigos na Wikipédia
async function checkArticlesInBatches(articles, batchSize, idioma) {
  const missingArticles = [];

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    const checks = batch.map((article) => checkArticleExists(article, idioma));
    const results = await Promise.all(checks);

    results.forEach((exists, index) => {
      if (!exists) missingArticles.push(batch[index]);
    });
  }

  return missingArticles;
}

async function checkArticleExists(article, idioma) {
  let base = 'en';
  if (idioma === 'es') base = 'es';
  else if (idioma === 'de') base = 'de';

  const url = `https://${base}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(article)}&prop=langlinks&lllang=pt&format=json&origin=*`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    const pages = Object.values(data.query.pages);
    return pages.some((page) => page.langlinks);
  } catch {
    return false;
  }
}

// 🖼️ Busca imagens de artigos
async function fetchArticleImages(articles, idioma) {
  let wikipediaAPI = 'https://en.wikipedia.org/w/api.php';
  if (idioma === 'es') wikipediaAPI = 'https://es.wikipedia.org/w/api.php';
  else if (idioma === 'de') wikipediaAPI = 'https://de.wikipedia.org/w/api.php';

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    prop: 'pageimages',
    pithumbsize: '900',
    origin: '*',
    titles: articles.join('|'),
  });

  try {
    const response = await fetch(`${wikipediaAPI}?${params}`);
    const data = await response.json();
    const pages = data.query.pages;

    return Object.values(pages).map((page) => ({
      title: page.title,
      image: page.thumbnail?.source || 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Image-not-available.png',
    }));
  } catch {
    return articles.map((title) => ({
      title,
      image: 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Image-not-available.png',
    }));
  }
}

// 📝 Busca descrições de artigos na Wikidata
async function fetchArticleDescriptions(articles) {
  const wikidataAPI = 'https://www.wikidata.org/w/api.php';

  const requests = articles.map(async (title) => {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      search: title,
      language: 'pt',
      format: 'json',
      origin: '*',
    });

    try {
      const response = await fetch(`${wikidataAPI}?${params}`);
      const data = await response.json();
      const page = data.search?.[0];

      if (
        page?.display?.description?.value &&
        title.replaceAll('_', ' ') === page.display.label.value
      ) {
        return { title, description: page.display.description.value };
      } else {
        return { title, description: '' };
      }
    } catch {
      return { title, description: '' };
    }
  });

  return await Promise.all(requests);
}
