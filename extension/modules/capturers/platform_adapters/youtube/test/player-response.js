var ytInitialPlayerResponse = {
      "captions": {
        "playerCaptionsTracklistRenderer": {
          "captionTracks": [
            {
              "baseUrl": "https://www.youtube.com/api/timedtext?v=test_stand&lang=ru&fmt=json3",
              "name": { "simpleText": "Русский" },
              "vssId": ".ru",
              "languageCode": "ru",
              "kind": "asr",
              "isTranslatable": true
            },
            {
              "baseUrl": "https://www.youtube.com/api/timedtext?v=test_stand&lang=en&fmt=json3",
              "name": { "simpleText": "English" },
              "vssId": ".en",
              "languageCode": "en",
              "isTranslatable": true
            }
          ]
        }
      }
    };
    window.ytInitialPlayerResponse = ytInitialPlayerResponse;
