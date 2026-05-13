const fs = require('fs');

async function test() {
  const url = 'https://ww3.animeonline.ninja/online/niwatori-fighter-rooster-fighter/';
  const res = await fetch(url);
  const html = await res.text();
  console.log("HTML length:", html.length);
  
  const matches = html.match(/<a[^>]+href=['"]([^'"]*\/episodio\/[^'"]+)['"][^>]*>/gi);
  if (matches) {
    console.log("Found episode links:");
    const urls = matches.map(m => m.match(/href=['"]([^'"]+)['"]/)[1]);
    const uniqueUrls = [...new Set(urls)];
    console.log(uniqueUrls);
  } else {
    console.log("No episode links found");
  }
}

test();
