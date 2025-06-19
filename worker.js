addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
      return new Response("Método não permitido", { status: 405, headers: corsHeaders });
  }

  try {
      const { articles, images, description, idioma } = await request.json();
      if (!Array.isArray(articles)) {
          return new Response("Formato inválido", { status: 400, headers: corsHeaders });
      }

      let result = [];

      if (images === "yes") {
          result = await fetchArticleImages(articles);
      } else if (description === "yes") {
          result = await fetchArticleDescriptions(articles);
      } else {
          result = await checkArticlesInBatches(articles, 50);
      }

      return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
      });

  } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: corsHeaders
      });
  }
}

// 🔎 Verifica artigos na Wikipédia
async function checkArticlesInBatches(articles, batchSize) {
  const missingArticles = [];

  for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, i + batchSize);
      const checks = batch.map(article => checkArticleExists(article));
      const results = await Promise.all(checks);

      results.forEach((exists, index) => {
          if (!exists) missingArticles.push(batch[index]);
      });
  }

  return missingArticles;
}

async function checkArticleExists(article, idioma) {
  var url;
	if (idioma == null) {
    url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(article)}&prop=langlinks&lllang=pt&format=json&origin=*`;
  } else if (idioma == "es") {
		url = `https://es.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(article)}&prop=langlinks&lllang=pt&format=json&origin=*`;
  } else if (idioma == "de") {
		url = `https://de.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(article)}&prop=langlinks&lllang=pt&format=json&origin=*`;
  }

  try {
      const response = await fetch(url);
      const data = await response.json();
      const pages = Object.values(data.query.pages);
      return pages.some(page => page.langlinks);
  } catch {
      return false;
  }
}

// 🖼️ Busca imagens de artigos
async function fetchArticleImages(articles, idioma) {
  var wikipediaAPI;
	if (idioma == null) {
    wikipediaAPI = "https://en.wikipedia.org/w/api.php";
  } else if (idioma == "es") {
		wikipediaAPI = "https://es.wikipedia.org/w/api.php";
  } else if (idioma == "de") {
		wikipediaAPI = "https://de.wikipedia.org/w/api.php";
  }
  const params = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "pageimages",
      pithumbsize: 900,
      origin: "*",
      titles: articles.join("|")
  });

  try {
      const response = await fetch(`${wikipediaAPI}?${params}`);
      const data = await response.json();
      const pages = data.query.pages;

      return Object.values(pages).map(page => ({
          title: page.title,
          image: page.thumbnail ? page.thumbnail.source : "https://upload.wikimedia.org/wikipedia/commons/c/cd/Image-not-available.png"
      }));

  } catch (error) {
      return articles.map(title => ({
          title,
          image: "https://upload.wikimedia.org/wikipedia/commons/c/cd/Image-not-available.png"
      }));
  }
}

// 📝 Busca descrições de artigos na Wikidata
async function fetchArticleDescriptions(articles) {
  const wikidataAPI = "https://www.wikidata.org/w/api.php";

  const requests = articles.map(async title => {
      const params = new URLSearchParams({
          action: "wbsearchentities",
          search: title,
          language: "pt",
          format: "json",
          origin: "*"
      });

      try {
          const response = await fetch(`${wikidataAPI}?${params}`);
          const data = await response.json();
          const page = data.search?.[0];

          if (page?.display?.description?.value && title.replaceAll("_", " ") === page.display.label.value) {
              return { title, description: page.display.description.value };
          } else {
              return { title, description: "" };
          }
      } catch {
          return { title, description: "" };
      }
  });

  return await Promise.all(requests);
}

// 🔥 Cabeçalhos CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
