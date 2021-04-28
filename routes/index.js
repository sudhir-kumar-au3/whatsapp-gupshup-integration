const express = require("express");
const router = express.Router();
const Axios = require("axios").default;
const querystring = require("querystring");
const fileType = require("file-type");
require("dotenv").config();
const fetch = require("node-fetch");

const BaseAxiosConfigs = {
  baseURL: "https://api.gupshup.io/sm/api/v1",
  headers: {
    accept: "application/json, text/plain, */*",
    apikey: process.env.API_KEY,
    "content-type": "application/x-www-form-urlencoded",
    "Cache-Control": "no-cache",
    "cache-control": "no-cache",
  },
};

// get buffer data for media attachments
async function getFileBuffer(url, args) {
  return new Promise((resolve, reject) => {
    try {
      const payload = {
        method: "get",
      };
      if (args && args.headers) {
        payload.headers = args.headers;
      }
      fetch(url, payload).then((res) => resolve(res.buffer()));
    } catch (exception) {
      reject(exception);
    }
  });
}

async function sendMessageToUsers(messageObj) {
  /* -------------------------for sending text messages------------------------- */
  // messageObj = {
  //   message: "Your text message or caption to medias",
  //   to: '<RECIPIENTS_whatsapp_NUMBER>'
  // }

  /*--------------------------for sending media files----------------------------*/
  //   // If you need to send media, place them in attachment key
  // messageObj = {
  //   attachment: {
  //     url: "your media URL",
  //     previewUrl: "your media preview URL", (required if media is image)
  //     originalUrl: "your media original URL",(required if media is image)
  //     text:"image caption if any *(optional)"
  //   },
  //   to: "<RECIPIENTS_whatsapp_NUMBER>";
  // };

  try {
    const payload = {
      channel: process.env.CHANNEL,
      "src.name": process.env.APP_NAME,
      source: process.env.SOURCE,
      destination: messageObj.to,
    };

    if (messageObj.attachment) {
      const fileBuffer = await getFileBuffer(messageObj.attachment.url);
      // identify type of attached media
      let typeOfFile = (await fileType.fromBuffer(fileBuffer)).mime.split(
        "/"
      )[0];

      if (!["image", "video", "audio"].includes(typeOfFile)) {
        typeOfFile = "file";
      }

      payload["message"] = {
        type: typeOfFile,
        url: messageObj.attachment.url,
        previewUrl:
          messageObj.attachment.previewUrl || messageObj.attachment.url,
        originalUrl:
          messageObj.attachment.originalUrl || messageObj.attachment.url,
      };
    } else {
      payload["message"] = {
        type: "text",
        text: messageObj.message,
      };
    }

    payload["message"] = JSON.stringify(payload["message"]);
    return await Axios.create(BaseAxiosConfigs).post(
      "/msg",
      querystring.stringify(payload)
    );
  } catch (exception) {
    console.error(exception);
    return exception;
  }
}

/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});

// Route for Gupshup Inbound Messages (callback webhook)
router.post("/callback", async function (req, res) {
  res.end();
  /*-----------------------revert with automated responses-------------------*/
  // sample automated replies
  let { payload, type } = req.body;
  if (type === "message" && payload.payload) {
    let body = {};
    let lower = payload.type.toLowerCase();
    switch (lower) {
      case "image":
        body = {
          attachment: {
            url: payload.payload.url,
            originalUrl: payload.payload.url,
            text: "Echo - image received",
          },
        };
        break;
      case "location":
        body = {
          message: `Echo - Longitude: ${payload.payload.longitude} and Latitude: ${payload.payload.latitude}`,
        };
        break;
      default:
        body = {
          message: "Echo - " + payload.payload.text,
        };
    }
    body["to"] = payload.source;
    await sendMessageToUsers(body);
    /*-----------------------------------------------------------------------------*/
  } else if (payload.type === "failed") {
    console.log({ "failure log": payload.payload });
  } else {
    console.log(`Ignored Message Type:${type}`);
  }
});

// Route for Gupshup Outbound Messages
router.get("/msg", async function (req, res) {
  const payload = {
    channel: "whatsapp",
    "src.name": "demoapp7",
    source: "917834811114",
    destination: "917337416428",
    message: "918587099540",
  };
  const gupshupResponse = await Axios.create(BaseAxiosConfigs).post(
    "/msg",
    querystring.stringify(payload)
  );
  res.status(200).send(gupshupResponse.data);
});

// Route for Inbound messages
// this will send the message to users through gupshup API
router.post("/msg", async function (req, res) {
  const { message, to, attachment } = req.body;

  try {
    const messageObj = {
      to, // Recipients number
    };
    const output = [];

    if (attachment && attachment.text) {
      // If attachment comes with the text, they will be sent separately in batches
      const messageOrder = 2;

      for (let i = 0; i < messageOrder; i++) {
        let batchPayload = {};
        if (i === 0) {
          batchPayload = {
            ...messageObj,
            attachment,
          };
          const messageData = await sendMessageToUsers(batchPayload);
          const sentMessageData = {
            message: attachment,
            ...messageData.data,
          };
          output.push(sentMessageData);
        } else {
          batchPayload = {
            ...messageObj,
            message: attachment.text,
          };
          const messageData = await sendMessageToUsers(batchPayload);
          const sentMessageData = {
            message: attachment.text,
            ...messageData.data,
          };
          output.push(sentMessageData);
        }
      }
    } else {
      messageObj.message = message;
      if (attachment) {
        messageObj.attachment = attachment;
      }
      const messageData = await sendMessageToUsers(messageObj);
      const sentMessageData = {
        message: attachment || message,
        ...messageData.data,
      };
      output.push(sentMessageData);
    }
    return res.status(200).send(output);
  } catch (exception) {
    console.error(exception);
    return res.status(500).send({
      error: true,
      message: "Error while processing the data.",
    });
  }
});

module.exports = router;
