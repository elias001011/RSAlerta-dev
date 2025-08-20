// netlify/functions/get-api-key.js
exports.handler = async () => {
  const weatherApiKey = process.env.WEATHER_API;

  if (!weatherApiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Chave da API não configurada no servidor.' })
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ apiKey: weatherApiKey })
  };
};
