// netlify/functions/fetch-openai.js - VERSÃO DEFINITIVA CORRIGIDA

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

    // BUSCA WEB MELHORADA - Se a busca web estiver ativada
    if (useWebSearch && searchApiKey && searchEngineId) {
      console.log('🔍 BUSCA WEB ATIVADA - Iniciando processamento...');
      const lastUserMessage = messages[messages.length - 1];
      
      if (lastUserMessage && lastUserMessage.role === 'user') {
        try {
          // Extrair termos de busca da mensagem do usuário - VERSÃO MELHORADA
          const searchQuery = extractSearchTerms(lastUserMessage.content);
          console.log('📝 TERMOS EXTRAÍDOS:', searchQuery);
          
          if (searchQuery) {
            // Realizar busca no Google Custom Search
            const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${searchEngineId}&q=${encodeURIComponent(searchQuery)}&num=5`;
            
            console.log('🌐 FAZENDO BUSCA WEB PARA:', searchQuery);
            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();
            
            if (searchData.items && searchData.items.length > 0) {
              console.log('✅ RESULTADOS ENCONTRADOS:', searchData.items.length);
              console.log('📋 TÍTULOS DOS RESULTADOS:', searchData.items.map(item => item.title));
              
              // Formatar resultados da busca de forma mais clara
              const searchResults = searchData.items.map(item => ({
                title: item.title,
                snippet: item.snippet,
                link: item.link
              }));
              
              // Criar contexto mais claro e específico para o Gemini
              const searchContext = `[🌐 INFORMAÇÕES ATUALIZADAS DA WEB]\nBusca realizada para: "${searchQuery}"\n\n${searchResults.map((result, index) => 
                `📍 Resultado ${index + 1}:\nTítulo: ${result.title}\nInformação: ${result.snippet}\nFonte: ${result.link}\n`
              ).join('\n')}\n[📋 FIM DAS INFORMAÇÕES WEB]\n\nIMPORTANTE: Use as informações acima para complementar sua resposta. Se as informações web não forem relevantes para a pergunta, diga isso claramente.\n\nPergunta original: `;
              
              // Modificar a última mensagem do usuário para incluir o contexto
              enhancedMessages[enhancedMessages.length - 1] = {
                ...lastUserMessage,
                content: searchContext + lastUserMessage.content
              };
              
              console.log('✅ CONTEXTO DE BUSCA ADICIONADO COM SUCESSO');
            } else {
              console.log('❌ NENHUM RESULTADO ENCONTRADO NA BUSCA WEB');
            }
          } else {
            console.log('⚠️ NENHUM TERMO DE BUSCA RELEVANTE IDENTIFICADO NA MENSAGEM:', lastUserMessage.content);
          }
        } catch (searchError) {
          console.error('❌ ERRO NA BUSCA WEB:', searchError);
          // Continuar sem busca se houver erro
        }
      }
    } else if (useWebSearch) {
      console.log('⚠️ BUSCA WEB SOLICITADA, MAS CHAVES NÃO CONFIGURADAS');
      console.log('SEARCH_API:', searchApiKey ? 'CONFIGURADA' : 'NÃO CONFIGURADA');
      console.log('SEARCH_ID:', searchEngineId ? 'CONFIGURADO' : 'NÃO CONFIGURADO');
    }

    // Converter mensagens do formato OpenAI para o formato Gemini
    const geminiContents = convertMessagesToGeminiFormat(enhancedMessages);

    // Definir o modelo (usar o solicitado ou padrão)
    const geminiModel = model || 'gemini-2.5-flash-lite';

    console.log('🚀 ENVIANDO PARA GEMINI:', geminiModel);

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
          maxOutputTokens: 2048,
          topK: 40,
          topP: 0.95
        }
      })
    });

    const data = await response.json();

    // Se a API do Gemini retornar um erro
    if (!response.ok) {
      console.error('❌ ERRO DA API GEMINI:', data);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data.error ? data.error.message : 'Falha ao buscar da API Gemini' })
      };
    }

    // Converter a resposta do Gemini para o formato compatível com OpenAI
    const convertedResponse = convertGeminiResponseToOpenAI(data);

    console.log('✅ RESPOSTA ENVIADA COM SUCESSO');

    // Retorne a resposta convertida para o frontend
    return {
      statusCode: 200,
      body: JSON.stringify(convertedResponse)
    };

  } catch (error) {
    console.error('❌ ERRO GERAL NA FUNÇÃO NETLIFY:', error);
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
    console.error('❌ RESPOSTA INVÁLIDA DO GEMINI:', geminiResponse);
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

// FUNÇÃO COMPLETAMENTE REESCRITA - EXTRAÇÃO INTELIGENTE DE TERMOS
function extractSearchTerms(message) {
  console.log('🔍 ANALISANDO MENSAGEM PARA EXTRAÇÃO:', message);
  
  const lowerMessage = message.toLowerCase();
  
  // DETECÇÃO ESPECÍFICA DE CONSULTAS CLIMÁTICAS
  const isWeatherQuery = [
    'clima', 'tempo', 'previsão', 'chuva', 'sol', 'temperatura', 'graus',
    'quente', 'frio', 'vento', 'umidade', 'meteorologia', 'weather'
  ].some(term => lowerMessage.includes(term));
  
  // EXTRAÇÃO DE NOMES DE CIDADES/LOCAIS
  const cityPatterns = [
    /(?:em|de|para|do|da)\s+([a-záàâãäéêëíîïóôõöúûüç\s]+?)(?:\s|$|,|\?|\.|!)/g,
    /([a-záàâãäéêëíîïóôõöúûüç\s]{2,}?)(?:\s+(?:clima|tempo|previsão|chuva|temperatura))/g,
    /(são paulo|rio de janeiro|belo horizonte|salvador|fortaleza|brasília|curitiba|recife|porto alegre|manaus|belém|goiânia|guarulhos|campinas|nova iguaçu|são luís|maceió|joão pessoa|teresina|natal|campo grande|cuiabá|aracaju|florianópolis|vitória)/g
  ];
  
  let extractedCities = [];
  cityPatterns.forEach(pattern => {
    const matches = [...lowerMessage.matchAll(pattern)];
    matches.forEach(match => {
      if (match[1] && match[1].trim().length > 2) {
        extractedCities.push(match[1].trim());
      }
    });
  });
  
  // Limpar cidades extraídas (remover palavras irrelevantes)
  const cleanCities = extractedCities
    .map(city => city.replace(/\b(clima|tempo|previsão|chuva|temperatura|em|de|para|do|da)\b/g, '').trim())
    .filter(city => city.length > 2);
  
  console.log('🏙️ CIDADES DETECTADAS:', cleanCities);
  
  if (isWeatherQuery) {
    console.log('🌤️ CONSULTA CLIMÁTICA DETECTADA');
    
    if (cleanCities.length > 0) {
      // Consulta climática com cidade específica
      const searchQuery = `previsão tempo clima ${cleanCities[0]} hoje`;
      console.log('✅ BUSCA CLIMÁTICA ESPECÍFICA:', searchQuery);
      return searchQuery;
    } else {
      // Consulta climática geral - tentar extrair contexto
      const contextWords = lowerMessage
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !['para', 'com', 'sem', 'sobre', 'que', 'qual', 'como', 'onde', 'quando'].includes(word));
      
      const searchQuery = `previsão tempo clima ${contextWords.slice(0, 3).join(' ')}`;
      console.log('⚠️ BUSCA CLIMÁTICA GERAL:', searchQuery);
      return searchQuery;
    }
  }
  
  // DETECÇÃO DE CONSULTAS DE NOTÍCIAS/EVENTOS ATUAIS
  const newsKeywords = [
    'notícias', 'últimas notícias', 'acontecendo', 'atual', 'recente',
    'hoje', 'agora', 'situação', 'estado', 'informações sobre',
    'últimas', 'urgente', 'emergência', 'atualização', 'ao vivo',
    'tempestade', 'inundação', 'enchente', 'alerta'
  ];
  
  const isNewsQuery = newsKeywords.some(keyword => lowerMessage.includes(keyword));
  
  if (isNewsQuery) {
    console.log('📰 CONSULTA DE NOTÍCIAS DETECTADA');
    
    // Extrair termos relevantes
    const stopWords = [
      'o', 'a', 'os', 'as', 'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos',
      'para', 'por', 'com', 'sem', 'sobre', 'que', 'qual', 'como', 'onde', 'quando',
      'me', 'te', 'se', 'é', 'são', 'está', 'estão', 'foi', 'foram', 'será', 'serão',
      'um', 'uma', 'uns', 'umas', 'pelo', 'pela', 'pelos', 'pelas'
    ];
    
    const words = lowerMessage
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word));
    
    // Priorizar palavras do contexto RS/Brasil
    const priorityWords = words.filter(word => 
      ['rs', 'rio', 'grande', 'sul', 'porto', 'alegre', 'brasil', 'são', 'paulo',
       'clima', 'tempo', 'chuva', 'enchente', 'alerta', 'emergência', 'defesa', 
       'civil', 'notícias', 'hoje', 'atual'].includes(word)
    );
    
    const finalWords = [...new Set([...priorityWords, ...words.slice(0, 4)])];
    const searchQuery = finalWords.slice(0, 6).join(' ');
    
    console.log('✅ BUSCA DE NOTÍCIAS:', searchQuery);
    return searchQuery;
  }
  
  console.log('❌ NENHUM PADRÃO DE BUSCA RECONHECIDO');
  return null;
}
