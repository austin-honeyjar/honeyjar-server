const axios = require('axios');

async function chatHandler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Health check first
    const testResponse = await axios.get(
      `https://api.langflow.astra.datastax.com/health`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.REACT_APP_APPLICATION_TOKEN}`
        }
      }
    );
    console.log('Health check response:', testResponse.status);

    const apiUrl = `https://api.langflow.astra.datastax.com/lf/${process.env.REACT_APP_LANGFLOW_ID}/api/v1/run/${process.env.REACT_APP_FLOW_ID}`;
    
    const axiosConfig = {
      method: 'post',
      url: apiUrl,
      data: req.body,
      headers: {
        'Authorization': `Bearer ${process.env.REACT_APP_APPLICATION_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Origin': req.headers.origin || 'http://localhost:3000',
        'Referer': req.headers.referer || 'http://localhost:3000/',
        'Host': 'api.langflow.astra.datastax.com'
      },
      validateStatus: function (status) {
        return status < 500;
      }
    };

    console.log('Making request with config:', {
      url: apiUrl,
      method: 'POST',
      headers: {
        ...axiosConfig.headers,
        'Authorization': 'Bearer [HIDDEN]'
      }
    });

    const response = await axios(axiosConfig);
    
    if (response.status !== 200) {
      console.warn('API returned non-200 status:', response.status, response.data);
    }

    return res.status(response.status).json(response.data);

  } catch (error) {
    console.error('API Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: {
          ...error.config?.headers,
          Authorization: 'Bearer [HIDDEN]'
        }
      }
    });

    return res.status(error.response?.status || 500).json({
      error: 'API request failed',
      message: error.message,
      details: error.response?.data || 'No additional details available'
    });
  }
}

module.exports = chatHandler; 