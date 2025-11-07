// នាំចូល (Import) Firebase Admin និង Cloud Functions
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch'); // ត្រូវការ fetch សម្រាប់ឆ្លើយតបទៅ Telegram

admin.initializeApp();
const db = admin.firestore();

// --- ត្រូវបំពេញ (MUST FILL IN) ---
// ជំនួស 'YOUR_BOT_TOKEN_HERE' ជាមួយ Bot Token ថ្មីរបស់អ្នក
const BOT_TOKEN = '8476586909:AAGxags-UgAFWstfIKGEGQM5sk05Oab2_28'; 

// ជំនួស 'YOUR_ADMIN_CHAT_ID_HERE' ជាមួយ Chat ID របស់អ្នក (Admin)
// នេះជា Chat ID ពីមុនរបស់អ្នក: '1458220999'
const ADMIN_CHAT_ID = '1458220999'; 

// ជំនួស 'default-app-id' ជាមួយ App ID ពិតប្រាកដរបស់អ្នក
// នៅក្នុង index.html អ្នកប្រើ __app_id, អ្នកត្រូវរកតម្លៃពិតរបស់វា
const APP_ID = 'default-app-id'; 
// --- បញ្ចប់ការបំពេញ ---


/**
 * ផ្ញើសារឆ្លើយតបទៅកាន់ Telegram
 */
async function sendTelegramResponse(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: text,
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Error sending Telegram response:", error);
  }
}

/**
 * មុខងារ (Function) នេះ នឹងដំណើរការរាល់ពេលដែល Telegram ផ្ញើសារមក
 * អ្នកត្រូវតັ້ງ Webhook របស់ Telegram Bot ឱ្យចង្អុលមក URL របស់ Function នេះ
 */
exports.telegramWebhook = functions.https.onRequest(async (req, res) => {
  // ពិនិត្យមើលថាសារមកពី Telegram មែន
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const update = req.body;
  
  // ពិនិត្យមើលថាតើវាជាសារ (message) ហើយមានអក្សរ (text) ឬអត់
  if (!update.message || !update.message.text) {
    return res.status(200).send('OK'); // មិនមែនជាសារដែលយើងចង់បាន
  }

  const message = update.message;
  const chatId = message.chat.id.toString(); // បម្លែងទៅជា String
  const text = message.text;

  // --- ផ្នែកសុវត្ថិភាព (Security Check) ---
  // ពិនិត្យមើលថា តើអ្នកផ្ញើជា Admin ឬអត់?
  if (chatId !== ADMIN_CHAT_ID) {
    await sendTelegramResponse(chatId, 'Sorry, you are not authorized to add products.');
    return res.status(200).send('OK');
  }

  // --- ផ្នែកដំណើរការ (Processing Logic) ---
  
  // ពិនិត្យមើលពាក្យបញ្ជា (command)
  if (text.startsWith('/additem ')) {
    // ឧទាហរណ៍ command: /additem Hoodie, 49.99, https://image.url/hoodie.png, This is a cool hoodie.
    // យើងបំបែក (parse) command នោះ
    const parts = text.substring(9).split(',').map(s => s.trim()); // បំបែកដោយសញ្ញា ,

    if (parts.length < 4) {
      await sendTelegramResponse(chatId, 'Error: Format មិនត្រឹមត្រូវ.\nសូមប្រើ: /additem <Name>, <Price>, <Image URL>, <Description>');
      return res.status(200).send('OK');
    }

    const [name, priceStr, image, description] = parts;
    const price = parseFloat(priceStr); // បម្លែងតម្លៃទៅជាលេខ

    if (isNaN(price)) {
      await sendTelegramResponse(chatId, `Error: តម្លៃ "${priceStr}" មិនត្រឹមត្រូវ. សូមបញ្ចូលតែលេខ.`);
      return res.status(200).send('OK');
    }

    // ត្រៀមទិន្នន័យ (Prepare data) សម្រាប់ Firestore
    const newProduct = {
      name: name,
      price: price,
      image: image,
      description: description,
      createdAt: admin.firestore.FieldValue.serverTimestamp() // បន្ថែមពេលវេលា
    };

    try {
      // ស្វែងរក Collection ផលិតផល (Find the products collection)
      const productsCollectionPath = `/artifacts/${APP_ID}/public/data/products`;
      const productsCol = db.collection(productsCollectionPath);
      
      // បន្ថែមផលិតផលថ្មី (Add new product)
      await productsCol.add(newProduct);

      // ផ្ញើសារប្រាប់ Admin ថាជោគជ័យ
      await sendTelegramResponse(chatId, `✅ ជោគជ័យ! ផលិតផល "${name}" ត្រូវបានបន្ថែមទៅក្នុង Website ហើយ។`);
      
    } catch (error) {
      console.error("Error adding product to Firestore:", error);
      await sendTelegramResponse(chatId, `❌ មានបញ្ហា! មិនអាចបន្ថែមផលិតផលបាន: ${error.message}`);
    }

  } else {
    // ប្រសិនបើ command មិនស្គាល់
    await sendTelegramResponse(chatId, 'Command មិនស្គាល់.\nដើម្បីបន្ថែមផលិតផល សូមប្រើ: /additem <Name>, <Price>, <Image URL>, <Description>');
  }

  // ឆ្លើយតប OK ទៅ Telegram វិញ
  return res.status(200).send('OK');
});