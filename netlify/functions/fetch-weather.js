// netlify/functions/fetch-weather.js
exports.handler = async (event) => {
  // Pega a chave da API do OpenWeatherMap das variáveis de ambiente
  const WEATHER_API_KEY = process.env.WEATHER_API;

  if (!WEATHER_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'A chave da API de clima não está configurada.' })
    };
  }

  // Pega os parâmetros da query string da requisição do frontend
  const { lat, lon, endpoint, q, limit } = event.queryStringParameters;

  let apiUrl;

  // Constrói a URL correta da API OpenWeatherMap com base no parâmetro 'endpoint'
  switch (endpoint) {
    case 'weather':
      apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric&lang=pt_br`;
      break;
    case 'forecast':
      apiUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric&lang=pt_br`;
      break;
    case 'air_pollution':
      apiUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}`;
      break;
    case 'direct': // Para geocodificação (busca de cidades)
      apiUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=${limit || 5}&appid=${WEATHER_API_KEY}`;
      break;
    default:
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Endpoint da API inválido.' })
      };
  }

  try {
    const response = await fetch(apiUrl);
    const data = await response.json();

    if (!response.ok) {
        // Repassa o erro da API OpenWeatherMap
        return {
            statusCode: response.status,
            body: JSON.stringify({ error: data.message || 'Falha ao buscar dados da API OpenWeatherMap' })
        };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Erro Interno do Servidor' })
    };
  }
};
