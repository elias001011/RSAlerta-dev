// netlify/functions/fetch-openai.js
exports.handler = async (event) => {
  // Permite apenas requisições POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Parse os dados enviados pelo frontend (histórico da conversa, modelo, etc.)
    const { messages, model, temperature, useWebSearch } = JSON.parse(event.body);
    
    // Obtenha as chaves API das variáveis de ambiente do Netlify
    const geminiApiKey = process.env.GEMINI_API;
    const searchApiKey = process.env.SEARCH_API;
    const searchEngineId = process.env.SEARCH_ID;

    if (!geminiApiKey) {
      console.error('Chave da API Gemini não configurada nas variáveis de ambiente.');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Configuração do servidor incompleta.' })
      };
    }

    let enhancedMessages = [...messages];

    // Se a busca web estiver ativada, realizar busca antes de enviar para a IA
    if (useWebSearch && searchApiKey && searchEngineId) {
      const lastUserMessage = messages[messages.length - 1];
      
      if (lastUserMessage && lastUserMessage.role === 'user') {
        try {
          // Extrair termos de busca da mensagem do usuário
          const searchQuery = extractSearchTerms(lastUserMessage.content);
          
          if (searchQuery) {
            // Realizar busca no Google Custom Search
            const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(searchQuery)}&num=5`;
            
            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();
            
            if (searchData.items && searchData.items.length > 0) {
              // Formatar resultados da busca
              const searchResults = searchData.items.map(item => ({
                title: item.title,
                snippet: item.snippet,
                link: item.link
              }));
              
              // Adicionar contexto de busca à mensagem
              const searchContext = `Resultados da busca web para "${searchQuery}":\n\n${searchResults.map(result => 
                `**${result.title}**\n${result.snippet}\nFonte: ${result.link}`
              ).join('\n\n')}\n\n---\n\n`;
              
              // Modificar a última mensagem do usuário para incluir o contexto
              enhancedMessages[enhancedMessages.length - 1] = {
                ...lastUserMessage,
                content: searchContext + lastUserMessage.content
              };
            }
          }
        } catch (searchError) {
          console.error('Erro na busca web:', searchError);
          // Continuar sem busca se houver erro
        }
      }
    }

    // Converter mensagens do formato OpenAI para o formato Gemini
    const geminiContents = convertMessagesToGeminiFormat(enhancedMessages);

    // Definir o modelo (usar o solicitado ou padrão)
    const geminiModel = model || 'gemini-2.5-flash-lite';

    // Faça a chamada para a API do Gemini
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: geminiContents.contents,
        systemInstruction: geminiContents.systemInstruction,
        generationConfig: {
          temperature: temperature || 0.7,
          maxOutputTokens: 2048
        }
      })
    });

    const data = await response.json();

    // Se a API do Gemini retornar um erro
    if (!response.ok) {
      console.error('Erro da API Gemini:', data);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error ? data.error.message : 'Falha ao buscar da API Gemini' })
      };
    }

    // Converter a resposta do Gemini para o formato compatível com OpenAI
    const convertedResponse = convertGeminiResponseToOpenAI(data);

    // Retorne a resposta convertida para o frontend
    return {
      statusCode: 200,
      body: JSON.stringify(convertedResponse)
    };

  } catch (error) {
    console.error('Erro na função Netlify:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Erro interno do servidor' })
    };
  }
};

// Função para converter mensagens do formato OpenAI para Gemini
function convertMessagesToGeminiFormat(messages) {
  let systemInstruction = null;
  const contents = [];

  for (const message of messages) {
    if (message.role === 'system') {
      // Usar a primeira mensagem system como systemInstruction
      if (!systemInstruction) {
        systemInstruction = {
          parts: [{ text: message.content }]
        };
      }
    } else if (message.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: message.content }]
      });
    } else if (message.role === 'assistant') {
      contents.push({
        role: 'model',
        parts: [{ text: message.content }]
      });
    }
  }

  return {
    contents,
    systemInstruction
  };
}

// Função para converter resposta do Gemini para formato compatível com OpenAI
function convertGeminiResponseToOpenAI(geminiResponse) {
  if (!geminiResponse.candidates || !geminiResponse.candidates[0] || !geminiResponse.candidates[0].content) {
    throw new Error('Resposta inválida da API Gemini');
  }

  const content = geminiResponse.candidates[0].content.parts[0].text;

  return {
    choices: [{
      message: {
        content: content,
        role: 'assistant'
      }
    }]
  };
}

// Função auxiliar para extrair termos de busca da mensagem do usuário
function extractSearchTerms(message) {
  // Palavras-chave que indicam necessidade de busca
  const searchKeywords = [
    'notícias', 'últimas notícias', 'acontecendo', 'atual', 'recente',
    'hoje', 'agora', 'situação', 'estado', 'condição', 'informações sobre',
    'o que está', 'como está', 'qual é', 'me fale sobre', 'pesquise',
    'busque', 'procure', 'encontre'
  ];
  
  const lowerMessage = message.toLowerCase();
  
  // Verificar se a mensagem contém palavras-chave de busca
  const needsSearch = searchKeywords.some(keyword => lowerMessage.includes(keyword));
  
  if (needsSearch) {
    // Extrair termos relevantes (remover palavras comuns)
    const stopWords = ['o', 'a', 'os', 'as', 'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos', 'para', 'por', 'com', 'sem', 'sobre', 'que', 'qual', 'como', 'onde', 'quando', 'me', 'te', 'se', 'é', 'são', 'está', 'estão', 'foi', 'foram', 'será', 'serão'];
    
    const words = message.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));
    
    // Retornar os primeiros 5 termos mais relevantes
    return words.slice(0, 5).join(' ');
  }
  
  return null;
}