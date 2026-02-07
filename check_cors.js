
import axios from 'axios';

const url = 'https://midas.minsal.cl/farmacia_v2/WS/getLocalesTurnos.php';
const origin = 'https://farmacia-turno.netlify.app';

async function check() {
  try {
    console.log('Testing connection to:', url);
    const response = await axios.get(url, {
      headers: {
        'Origin': origin,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      },
      validateStatus: () => true // Don't throw on error status
    });

    console.log('Status:', response.status);
    console.log('CORS Header:', response.headers['access-control-allow-origin']);
    console.log('Content Type:', response.headers['content-type']);
    if (response.status !== 200) {
        console.log('Body preview:', response.data.toString().substring(0, 200));
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

check();
