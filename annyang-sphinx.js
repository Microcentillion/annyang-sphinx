(function undefined() {
   "use strict";
   // These will be initialized later
   var recognizer, recorder, callbackManager, audioContext, vizualizer;
   // Only when both recorder and recognizer do we have a ready application
   var hasGrammar = false;
   var hasWords = false;
   var recorderReady = false;
   var recognizerInit = false;
   var recognizerReady = false;
   var isReady = false;
   var readyCallback = false;
  
   
   var wordlist;
   
   var root = this;
   
   var makeReady = function () {
      isReady = true;
   }
   
   var checkRecognizer = function () {
      console.log('recognizer checked...');
      if (recognizer && hasWords == true && hasGrammar == true) {
         console.log('   ...ready!!');
         recognizerReady = 1;
         checkReady();
      } else {
         console.log('   ...not ready yet');
      }
   }
   
   var checkRecognizerQueue = function () {
      console.log('Checking Queue...');
      if (hasWords !== false && hasWords !== true) {
         console.log('  ...Sending words');
         postRecognizerJob({command: 'addWords', data: hasWords}, function () {
            checkRecognizerQueue();
            console.log('words added');
         });
         
         hasWords = true;
         return true;
      }
      
      if (hasGrammar !== false && hasGrammar !== true) {
         console.log('  ...Sending grammar');
         postRecognizerJob({command: 'addGrammar', data: hasGrammar}, function () {
            checkRecognizerQueue();
            console.log('grammar added');
         });
         
         hasGrammar = true;
         return true;
      }
   
      checkRecognizer();   
      console.log('No queue for recognizer');
   }
   
   var checkReady = function () {
      console.log('checkReady...');
      if (recognizerReady && recorderReady) {
         console.log('  ...yup');
         if (!isReady) {
            console.log('    ...saving it');
            isReady = true;
            if (readyCallback) readyCallback();
         }
      } else {
         if (!recognizerReady) console.log('  ...waiting on recognizer');
         if (!recorderReady) console.log('  ...waiting on recorder');
      }
   }
   
   var startUserMedia = function (stream) {
      console.log('starting user media');
      var input = audioContext.createMediaStreamSource(stream);
      // Firefox hack https://support.mozilla.org/en-US/questions/984179
      window.firefox_audio_hack = input; 
      var audioRecorderConfig = {errorCallback: function(x) {console.log("** Error from recorder: " + x);}}; // Status change
      recorder = new AudioRecorder(input, audioRecorderConfig);
      // If a recognizer is ready, we pass it to the recorder
      if (recognizer) recorder.consumers = [recognizer];
      console.log('recorder ready!');
      console.log(recorder);
      recorderReady = 1;
      checkReady();
   }
   
   var spawnWorker = function (workerURL, callback) {
      console.log('spawning worker');
      recognizer = new Worker(workerURL);
      recognizer.onmessage = function(event) {
         console.log('recognizer initialized');
         callback(recognizer);
      };
      
      recognizer.postMessage('');
   }
   
   var initRecognizer = function(callback) {
      console.log('initRecognizer');
      postRecognizerJob({command: 'initialize'}, function() {
         if (recorder) {
            recorder.consumers = [recognizer];
         }
         
         console.log('Recognizer allegedly loaded');
         recognizerInit = 1;
         checkRecognizerQueue();
         checkReady();
         
      });
      
      if (callback) callback();
   }
   
   var postRecognizerJob = function (message, callback) {
      var msg = message || {};
      if (callbackManager) {
         msg.callbackId = callbackManager.add(callback);
      }
      
      if (recognizer) {
         recognizer.postMessage(msg);
      }
   }
   
   root.annsphinx = {
   
      init: function(notify) {
         callbackManager = new CallbackManager();
         spawnWorker("js/recognizer.js", function(worker) {
            
            // This is the onmessage function, once the worker is fully loaded
            worker.onmessage = function(e) {
               console.log(e);
               // This is the case when we have a callback id to be called
               if (e.data.hasOwnProperty('id')) {
                  var clb = callbackManager.get(e.data['id']);
                  var data = {};
                  
                  if (e.data.hasOwnProperty('data')) {   // If there are parameters of the callback
                     data = e.data.data;                 // Add them
                  }

                  if(clb) {                         // If the callback exists
                     clb(data);                     // call it with its data.
                  }
               }
                  
                  // This is a case when the recognizer has a new hypothesis
               if (e.data.hasOwnProperty('hyp')) {
                  var newHyp = e.data.hyp;
                  if (e.data.hasOwnProperty('final') &&  e.data.final) {      // If the data is Final
                     newHyp = "Final: " + newHyp;                             // Say so
                  }
                  
                  console.log(newHyp);    // do something with the hypothesis
               }
               // This is the case when we have an error
               if (e.data.hasOwnProperty('status') && (e.data.status == "error")) {
                  console.log("** Error in " + e.data.command + " with code " + JSON.stringify(e.data.code));
               }
            },            
            // Once the worker is fully loaded, we can call the initialize function
            initRecognizer();
         });
         
         try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
            window.URL = window.URL || window.webkitURL;
            audioContext = new AudioContext();
            if (notify) notify({success: 1});
            
         } catch (e) {
            if (notify) notify({error: 'Error initializing audio in browser'});
         }

         if (navigator.getUserMedia) {
            navigator.getUserMedia({audio: true}, startUserMedia, function(e) {
               if (notify) notify({error: 'No input available'});
            });
            
         } else {
            if (notify) notify({error: 'Live audio not supported in this browser'});
         }
         
         return this;
      },
      
      addConsumer: function (consumer) {
         if (recognizerReady && recorderReady) recorder.consumers = [consumer];
         return this;
      },
      
      start: function(callback) {
         if (recorder && recorder.start() && callback) {
            callback();
         } else {
            console.log(recorder);
         }
         
         return this;
      },
      
      stop: function (callback) {
         if (recorder && recorder.stop() && callback) {
            callback();
         } else {
            console.log(recorder);
         }
         return this;
      },
      
      addWords: function (words, append, callback) {
         if (append) {
            wordlist = wordlist.concat(words);
         } else {
            wordlist = words;
         }
         
         if (recognizerInit == 1) {
            postRecognizerJob({command: 'addWords', data: wordlist}, function () {
               hasWords = true;
               checkRecognizer();
               console.log('words added');
            });
            
            if (callback) callback();
         } else {
         
            hasWords = wordlist;
            console.log('words queued');
            if (callback) callback();
         }
         
         return this;
      },
      
      addGrammar: function (grammar, callback) {
         if (recognizerInit == 1) {
            postRecognizerJob({command: 'addGrammar', data: grammar}, function () {
               hasGrammar = true;
               checkRecognizer();
               console.log('grammar added');
            });

            if (callback) callback()
         } else {
         
            hasGrammar = grammar;
            console.log('grammar queued');
            if (callback) callback();
         }
         return this;
      },
      
      onReady: function (callback) {
         if (isReady) {
            callback();
         } else {
            readyCallback = callback;
         }
         
         return this;
      }
   };
}).call(this);
