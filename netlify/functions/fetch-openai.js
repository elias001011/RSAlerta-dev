// netlify/functions/fetch-openai.js
exports.handler = async (event) => {
  // Permite apenas requisições POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Parse os dados enviados pelo frontend (histórico da conversa, modelo, etc.)
    const { messages, model, temperature } = JSON.parse(event.body);
    
    // Obtenha a chave API da OpenAI das variáveis de ambiente do Netlify
    const openAIKey = process.env.OPENAI_API_KEY;

    if (!openAIKey) {
      console.error('Chave da API OpenAI não configurada nas variáveis de ambiente.');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Configuração do servidor incompleta.' })
      };
    }

    // Faça a chamada para a API da OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAIKey}` // A chave API é usada aqui, no servidor
      },
      body: JSON.stringify({
        model: model || 'gpt-4.1-nano-2025-04-14', // Use o modelo passado ou um padrão
        messages: messages,
        temperature: temperature || 0.7 // Use a temperatura passada ou um padrão
      })
    });

    const data = await response.json();

    // Se a API da OpenAI retornar um erro
    if (!response.ok) {
      console.error('Erro da API OpenAI:', data);
      return {
        statusCode: response.status,
        // Tente passar a mensagem de erro da OpenAI, se disponível
        body: JSON.stringify({ error: data.error ? data.error.message : 'Falha ao buscar da API OpenAI' })
      };
    }

    // Retorne a resposta da OpenAI para o frontend
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error('Erro na função Netlify:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Erro interno do servidor' })
    };
  }
};
