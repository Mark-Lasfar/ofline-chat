tts.js
==========

tts.js is a Text-To-Speech compiled from eSpeak using Emscripten and it supports multiple languages.

How To Use?
==========

First, load the config file first, then the voice files. After finished loading you can starting kick some speech out!

The config file and voice files  are stored in the module's folder.

	var tts = require('tts.js'); //require the module
	tts.loadConfig(__dirname+'/node_modules/tts.js/tts_config.json'); //Load the config file
	//Load the voice file. Beware that this call is asynchonrous.
	tts.loadVoice(__dirname+'/node_modules/tts.js/voices/en/en.json',function(){
		var wav = tts.speak("Some words",{
			amplitude: 100, //The amplitude
			wordgap: 0, //Gap between words
			pitch: 50, //The pitch of the speech
			speed: 175, //The speed
			voice: 'en/en' //The language of the text
		});
		
		//Now wav contains a buffer containing the speech as a wave file.
	});

Supported Languages
===================

Currently tts.js supports the languages listed below:

1. ca (Catalan)
2. cs (Czech)
3. de (German)
4. el (Greek)
5. en/en (English)
6. en/en-n (English, regional)
7. en/en-rp (English, regional)
8. en/en-sc (English, Scottish)
9. en/en-us (English, US)
10. en/en-wm (English, regional)
11. eo (Esperanto)
12. es (Spanish)
13. es-la (Spanish, Latin America)
14. fi (Finnish)
15. fr (French)
16. hu (Hungarian)
17. it (Italian)
18. kn (Kannada)
19. la (Latin)
20. lv (Latvian)
21. nl (Dutch)
22. pl (Polish)
23. pt (Portuguese, Brazil)
24. pt-pt (Portuguese, European)
25. ro (Romanian)
26. sk (Slovak)
27. sv (Swedish)
28. tr (Turkish)