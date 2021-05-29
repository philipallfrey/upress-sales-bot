const admin = require("firebase-admin");
const functions = require("firebase-functions");
const Twit = require('twit');

admin.initializeApp(functions.config().firebase);

exports.tweetNewSales = functions
    .runWith({
      timeoutSeconds: 540, // max timeout
      memory: "2GB", // more ram
    })
    .pubsub.schedule("every 60 minutes")
    .onRun( async () => {
      const listId = "1374212075627548677"; // https://twitter.com/i/lists/1374212075627548677
      const T = new Twit(functions.config().twitter);

      const data = await admin
          .firestore()
          .collection("tweetId")
          .doc("latest")
          .get();

      const since = data.get("since");

      // Get tweets from University Press accounts in my list
      // I believe the max count is 200, and there is a maximum of ~3200 tweets
      // in a list, before filtering out retweets
      const results  = await T.get("lists/statuses", {
        count: 1000,
        list_id: listId,
        include_entities: false,
        include_rts: false,
        since_id: since,
      })
          .catch((err) => {
            console.log(JSON.stringify(err));
          });

      // Save latestId for subsequent calls
      const latestId = results.data[0].id;
      admin
          .firestore()
          .collection("tweetId")
          .doc("latest")
          .set({since: +latestId}); // Force numeric format, just in case

      // Filter to find tweets which mention a sale/discount
      const regex = /\bsale\b|\bcode\b|\bcoupon\b|\bdiscount(s?)\b|\bdescuento(s?)\b|%/i;
      const tweets = results.data
          .filter((tweet) => regex.test(tweet.text))
          .map((tweet) => {
            return {
              handle: tweet.user.screen_name,
              id: tweet.id_str, // Must be string format for use in retweet
              text: tweet.text,
              user: tweet.user.name,
            };
          });
      console.log(JSON.stringify(tweets));

      // Retweet tweets about sales/discounts
      for(t of tweets) {
        T.post('statuses/update', {status:`From ${t.user}:`, attachment_url:`https://twitter.com/${t.handle}/status/${t.id}`}, (err, data, response) => {
          if (err) {
            console.error(JSON.stringify(err))
          }
        });
      }
    });
