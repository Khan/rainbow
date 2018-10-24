(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global.Rainbow = factory());
}(this, function () { 'use strict';

  function isNode$1() {
    return typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
  }

  function isWorker$1() {
      return typeof document === 'undefined' && typeof self !== 'undefined';
  }

  /**
   * Browser Only - Gets the language for this block of code
   *
   * @param {Element} block
   * @return {string|null}
   */
  function getLanguageForBlock(block) {

      // If this doesn't have a language but the parent does then use that.
      //
      // This means if for example you have: <pre data-language="php">
      // with a bunch of <code> blocks inside then you do not have
      // to specify the language for each block.
      var language = block.getAttribute('data-language') || block.parentNode.getAttribute('data-language');

      // This adds support for specifying language via a CSS class.
      //
      // You can use the Google Code Prettify style: <pre class="lang-php">
      // or the HTML5 style: <pre><code class="language-php">
      if (!language) {
          var pattern = /\blang(?:uage)?-(\w+)/;
          var match = block.className.match(pattern) || block.parentNode.className.match(pattern);

          if (match) {
              language = match[1];
          }
      }

      if (language) {
          return language.toLowerCase();
      }

      return null;
  }

  /**
   * Determines if two different matches have complete overlap with each other
   *
   * @param {number} start1   start position of existing match
   * @param {number} end1     end position of existing match
   * @param {number} start2   start position of new match
   * @param {number} end2     end position of new match
   * @return {boolean}
   */
  function hasCompleteOverlap(start1, end1, start2, end2) {

      // If the starting and end positions are exactly the same
      // then the first one should stay and this one should be ignored.
      if (start2 === start1 && end2 === end1) {
          return false;
      }

      return start2 <= start1 && end2 >= end1;
  }

  /**
   * Encodes < and > as html entities
   *
   * @param {string} code
   * @return {string}
   */
  function htmlEntities(code) {
      return code.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&(?![\w\#]+;)/g, '&amp;');
  }

  /**
   * Finds out the position of group match for a regular expression
   *
   * @see http://stackoverflow.com/questions/1985594/how-to-find-index-of-groups-in-match
   * @param {Object} match
   * @param {number} groupNumber
   * @return {number}
   */
  function indexOfGroup(match, groupNumber) {
      var index = 0;

      for (var i = 1; i < groupNumber; ++i) {
          if (match[i]) {
              index += match[i].length;
          }
      }

      return index;
  }

  /**
   * Determines if a new match intersects with an existing one
   *
   * @param {number} start1    start position of existing match
   * @param {number} end1      end position of existing match
   * @param {number} start2    start position of new match
   * @param {number} end2      end position of new match
   * @return {boolean}
   */
  function intersects(start1, end1, start2, end2) {
      if (start2 >= start1 && start2 < end1) {
          return true;
      }

      return end2 > start1 && end2 < end1;
  }

  /**
   * Sorts an objects keys by index descending
   *
   * @param {Object} object
   * @return {Array}
   */
  function keys(object) {
      var locations = [];

      for (var location in object) {
          if (object.hasOwnProperty(location)) {
              locations.push(location);
          }
      }

      // numeric descending
      return locations.sort(function (a, b) { return b - a; });
  }

  /**
   * Substring replace call to replace part of a string at a certain position
   *
   * @param {number} position         the position where the replacement
   *                                  should happen
   * @param {string} replace          the text we want to replace
   * @param {string} replaceWith      the text we want to replace it with
   * @param {string} code             the code we are doing the replacing in
   * @return {string}
   */
  function replaceAtPosition(position, replace, replaceWith, code) {
      var subString = code.substr(position);

      // This is needed to fix an issue where $ signs do not render in the
      // highlighted code
      //
      // @see https://github.com/ccampbell/rainbow/issues/208
      replaceWith = replaceWith.replace(/\$/g, '$$$$')

      return code.substr(0, position) + subString.replace(replace, replaceWith);
  }

  /**
   * Creates a usable web worker from an anonymous function
   *
   * mostly borrowed from https://github.com/zevero/worker-create
   *
   * @param {Function} fn
   * @param {Prism} Prism
   * @return {Worker}
   */
  function createWorker(fn, Prism) {
      if (isNode$1()) {
          /* globals global, require, __filename */
          // Disable require so it doesn't trigger import
          // global.Worker = require('webworker-threads').Worker;
          return new Worker(__filename);
      }

      var prismFunction = Prism.toString();

      var code = keys.toString();
      code += htmlEntities.toString();
      code += hasCompleteOverlap.toString();
      code += intersects.toString();
      code += replaceAtPosition.toString();
      code += indexOfGroup.toString();
      code += prismFunction;

      var fullString = code + "\tthis.onmessage=" + (fn.toString());

      var blob = new Blob([fullString], { type: 'text/javascript' });
      return new Worker((window.URL || window.webkitURL).createObjectURL(blob));
  }

  /**
   * Prism is a class used to highlight individual blocks of code
   *
   * @class
   */
  var Prism = function Prism(options) {
      /**
       * Object of replacements to process at the end of the processing
       *
       * @type {Object}
       */
      var replacements = {};

      /**
       * Language associated with this Prism object
       *
       * @type {string}
       */
      var currentLanguage;

      /**
       * Object of start and end positions of blocks to be replaced
       *
       * @type {Object}
       */
      var replacementPositions = {};

      /**
       * Determines if the match passed in falls inside of an existing match.
       * This prevents a regex pattern from matching inside of another pattern
       * that matches a larger amount of code.
       *
       * For example this prevents a keyword from matching `function` if there
       * is already a match for `function (.*)`.
       *
       * @param {number} startstart position of new match
       * @param {number} end  end position of new match
       * @return {boolean}
       */
      function _matchIsInsideOtherMatch(start, end) {
          for (var key in replacementPositions) {
              key = parseInt(key, 10);

              // If this block completely overlaps with another block
              // then we should remove the other block and return `false`.
              if (hasCompleteOverlap(key, replacementPositions[key], start, end)) {
                  delete replacementPositions[key];
                  delete replacements[key];
              }

              if (intersects(key, replacementPositions[key], start, end)) {
                  return true;
              }
          }

          return false;
      }

      /**
       * Takes a string of code and wraps it in a span tag based on the name
       *
       * @param {string} name    name of the pattern (ie keyword.regex)
       * @param {string} code    block of code to wrap
       * @param {string} globalClass class to apply to every span
       * @return {string}
       */
      function _wrapCodeInSpan(name, code) {
          var className = name.replace(/\./g, ' ');

          var globalClass = options.globalClass;
          if (globalClass) {
              className += " " + globalClass;
          }

          return ("<span class=\"" + className + "\">" + code + "</span>");
      }

      /**
       * Process replacements in the string of code to actually update
       * the markup
       *
       * @param {string} code     the code to process replacements in
       * @return {string}
       */
      function _processReplacements(code) {
          var positions = keys(replacements);
          for (var i = 0, list = positions; i < list.length; i += 1) {
              var position = list[i];

              var replacement = replacements[position];
              code = replaceAtPosition(position, replacement.replace, replacement.with, code);
          }
          return code;
      }

      /**
       * It is so we can create a new regex object for each call to
       * _processPattern to avoid state carrying over when running exec
       * multiple times.
       *
       * The global flag should not be carried over because we are simulating
       * it by processing the regex in a loop so we only care about the first
       * match in each string. This also seems to improve performance quite a
       * bit.
       *
       * @param {RegExp} regex
       * @return {string}
       */
      function _cloneRegex(regex) {
          var flags = '';

          if (regex.ignoreCase) {
              flags += 'i';
          }

          if (regex.multiline) {
              flags += 'm';
          }

          return new RegExp(regex.source, flags);
      }

      /**
       * Matches a regex pattern against a block of code, finds all matches
       * that should be processed, and stores the positions of where they
       * should be replaced within the string.
       *
       * This is where pretty much all the work is done but it should not
       * be called directly.
       *
       * @param {Object} pattern
       * @param {string} code
       * @param {number} offset
       * @return {mixed}
       */
      function _processPattern(pattern, code, offset) {
          if ( offset === void 0 ) offset = 0;

          var regex = pattern.pattern;
          if (!regex) {
              return false;
          }

          // Since we are simulating global regex matching we need to also
          // make sure to stop after one match if the pattern is not global
          var shouldStop = !regex.global;

          regex = _cloneRegex(regex);
          var match = regex.exec(code);
          if (!match) {
              return false;
          }

          // Treat match 0 the same way as name
          if (!pattern.name && pattern.matches && typeof pattern.matches[0] === 'string') {
              pattern.name = pattern.matches[0];
              delete pattern.matches[0];
          }

          var replacement = match[0];
              var startPos = match.index + offset;
          var endPos = match[0].length + startPos;

          // In some cases when the regex matches a group such as \s* it is
          // possible for there to be a match, but have the start position
          // equal the end position. In those cases we should be able to stop
          // matching. Otherwise this can lead to an infinite loop.
          if (startPos === endPos) {
              return false;
          }

          // If this is not a child match and it falls inside of another
          // match that already happened we should skip it and continue
          // processing.
          if (_matchIsInsideOtherMatch(startPos, endPos)) {
              return {
                  remaining: code.substr(endPos - offset),
                  offset: endPos
              };
          }

          /**
           * Callback for when a match was successfully processed
           *
           * @param {string} repl
           * @return {void}
           */
          function onMatchSuccess(repl) {

              // If this match has a name then wrap it in a span tag
              if (pattern.name) {
                  repl = _wrapCodeInSpan(pattern.name, repl);
              }

              // For debugging
              // console.log('Replace ' + match[0] + ' with ' + replacement + ' at position ' + startPos + ' to ' + endPos);

              // Store what needs to be replaced with what at this position
              replacements[startPos] = {
                  'replace': match[0],
                  'with': repl
              };

              // Store the range of this match so we can use it for
              // comparisons with other matches later.
              replacementPositions[startPos] = endPos;

              if (shouldStop) {
                  return false;
              }

              return {
                  remaining: code.substr(endPos - offset),
                  offset: endPos
              };
          }

          /**
           * Helper function for processing a sub group
           *
           * @param {number} groupKey  index of group
           * @return {void}
           */
          function _processGroup(groupKey) {
              var block = match[groupKey];

              // If there is no match here then move on
              if (!block) {
                  return;
              }

              var group = pattern.matches[groupKey];
              var language = group.language;

              /**
               * Process group is what group we should use to actually process
               * this match group.
               *
               * For example if the subgroup pattern looks like this:
               *
               * 2: {
               * 'name': 'keyword',
               * 'pattern': /true/g
               * }
               *
               * then we use that as is, but if it looks like this:
               *
               * 2: {
               * 'name': 'keyword',
               * 'matches': {
               *      'name': 'special',
               *      'pattern': /whatever/g
               *  }
               * }
               *
               * we treat the 'matches' part as the pattern and keep
               * the name around to wrap it with later
               */
              var groupToProcess = group.name && group.matches ? group.matches : group;

              /**
               * Takes the code block matched at this group, replaces it
               * with the highlighted block, and optionally wraps it with
               * a span with a name
               *
               * @param {string} passedBlock
               * @param {string} replaceBlock
               * @param {string|null} matchName
               */
              var _getReplacement = function(passedBlock, replaceBlock, matchName) {
                  replacement = replaceAtPosition(indexOfGroup(match, groupKey), passedBlock, matchName ? _wrapCodeInSpan(matchName, replaceBlock) : replaceBlock, replacement);
                  return;
              };

              // If this is a string then this match is directly mapped
              // to selector so all we have to do is wrap it in a span
              // and continue.
              if (typeof group === 'string') {
                  _getReplacement(block, block, group);
                  return;
              }

              var localCode;
              var prism = new Prism(options);

              // If this is a sublanguage go and process the block using
              // that language
              if (language) {
                  localCode = prism.refract(block, language);
                  _getReplacement(block, localCode);
                  return;
              }

              // The process group can be a single pattern or an array of
              // patterns. `_processCodeWithPatterns` always expects an array
              // so we convert it here.
              localCode = prism.refract(block, currentLanguage, groupToProcess.length ? groupToProcess : [groupToProcess]);
              _getReplacement(block, localCode, group.matches ? group.name : 0);
          }

          // If this pattern has sub matches for different groups in the regex
          // then we should process them one at a time by running them through
          // the _processGroup function to generate the new replacement.
          //
          // We use the `keys` function to run through them backwards because
          // the match position of earlier matches will not change depending
          // on what gets replaced in later matches.
          var groupKeys = keys(pattern.matches);
          for (var i = 0, list = groupKeys; i < list.length; i += 1) {
              var groupKey = list[i];

              _processGroup(groupKey);
          }

          // Finally, call `onMatchSuccess` with the replacement
          return onMatchSuccess(replacement);
      }

      /**
       * Processes a block of code using specified patterns
       *
       * @param {string} code
       * @param {Array} patterns
       * @return {string}
       */
      function _processCodeWithPatterns(code, patterns) {
          for (var i = 0, list = patterns; i < list.length; i += 1) {
              var pattern = list[i];

              var result = _processPattern(pattern, code);
              while (result) {
                  result = _processPattern(pattern, result.remaining, result.offset);
              }
          }

          // We are done processing the patterns so we should actually replace
          // what needs to be replaced in the code.
          return _processReplacements(code);
      }

      /**
       * Returns a list of regex patterns for this language
       *
       * @param {string} language
       * @return {Array}
       */
      function getPatternsForLanguage(language) {
          var patterns = options.patterns[language] || [];
          while (options.inheritenceMap[language]) {
              language = options.inheritenceMap[language];
              patterns = patterns.concat(options.patterns[language] || []);
          }

          return patterns;
      }

      /**
       * Takes a string of code and highlights it according to the language
       * specified
       *
       * @param {string} code
       * @param {string} language
       * @param {object} patterns optionally specify a list of patterns
       * @return {string}
       */
      function _highlightBlockForLanguage(code, language, patterns) {
          currentLanguage = language;
          patterns = patterns || getPatternsForLanguage(language);
          return _processCodeWithPatterns(htmlEntities(code), patterns);
      }

      this.refract = _highlightBlockForLanguage;
  };

  function rainbowWorker(e) {
      var message = e.data;

      var prism = new Prism(message.options);
      var result = prism.refract(message.code, message.lang);

      function _reply() {
          self.postMessage({
              id: message.id,
              lang: message.lang,
              result: result
          });
      }

      // I realized down the road I might look at this and wonder what is going on
      // so probably it is not a bad idea to leave a comment.
      //
      // This is needed because right now the node library for simulating web
      // workers “webworker-threads” will keep the worker open and it causes
      // scripts running from the command line to hang unless the worker is
      // explicitly closed.
      //
      // This means for node we will spawn a new thread for every asynchronous
      // block we are highlighting, but in the browser we will keep a single
      // worker open for all requests.
      if (message.isNode) {
          _reply();
          self.close();
          return;
      }

      setTimeout(function () {
          _reply();
      }, message.options.delay * 1000);
  }

  /**
   * An array of the language patterns specified for each language
   *
   * @type {Object}
   */
  var patterns = {};

  /**
   * An object of languages mapping to what language they should inherit from
   *
   * @type {Object}
   */
  var inheritenceMap = {};

  /**
   * A mapping of language aliases
   *
   * @type {Object}
   */
  var aliases = {};

  /**
   * Representation of the actual rainbow object
   *
   * @type {Object}
   */
  var Rainbow = {};

  /**
   * Callback to fire after each block is highlighted
   *
   * @type {null|Function}
   */
  var onHighlightCallback;

  /**
   * Counter for block ids
   * @see https://github.com/ccampbell/rainbow/issues/207
   */
  var id = 0;

  var isNode = isNode$1();
  var isWorker = isWorker$1();

  var cachedWorker = null;
  function _getWorker() {
      if (isNode || cachedWorker === null) {
          cachedWorker = createWorker(rainbowWorker, Prism);
      }

      return cachedWorker;
  }

  /**
   * Helper for matching up callbacks directly with the
   * post message requests to a web worker.
   *
   * @param {object} message      data to send to web worker
   * @param {Function} callback   callback function for worker to reply to
   * @return {void}
   */
  function _messageWorker(message, callback) {
      var worker = _getWorker();

      function _listen(e) {
          if (e.data.id === message.id) {
              callback(e.data);
              worker.removeEventListener('message', _listen);
          }
      }

      worker.addEventListener('message', _listen);
      worker.postMessage(message);
  }

  /**
   * Browser Only - Handles response from web worker, updates DOM with
   * resulting code, and fires callback
   *
   * @param {Element} element
   * @param {object} waitingOn
   * @param {Function} callback
   * @return {void}
   */
  function _generateHandler(element, waitingOn, callback) {
      return function _handleResponseFromWorker(data) {
          element.innerHTML = data.result;
          element.classList.remove('loading');
          element.classList.add('rainbow-show');

          if (element.parentNode.tagName === 'PRE') {
              element.parentNode.classList.remove('loading');
              element.parentNode.classList.add('rainbow-show');
          }

          // element.addEventListener('animationend', (e) => {
          //     if (e.animationName === 'fade-in') {
          //         setTimeout(() => {
          //             element.classList.remove('decrease-delay');
          //         }, 1000);
          //     }
          // });

          if (onHighlightCallback) {
              onHighlightCallback(element, data.lang);
          }

          if (--waitingOn.c === 0) {
              callback();
          }
      };
  }

  /**
   * Gets options needed to pass into Prism
   *
   * @param {object} options
   * @return {object}
   */
  function _getPrismOptions(options) {
      return {
          patterns: patterns,
          inheritenceMap: inheritenceMap,
          aliases: aliases,
          globalClass: options.globalClass,
          delay: !isNaN(options.delay) ? options.delay : 0
      };
  }

  /**
   * Gets data to send to webworker
   *
   * @param  {string} code
   * @param  {string} lang
   * @return {object}
   */
  function _getWorkerData(code, lang) {
      var options = {};
      if (typeof lang === 'object') {
          options = lang;
          lang = options.language;
      }

      lang = aliases[lang] || lang;

      var workerData = {
          id: id++,
          code: code,
          lang: lang,
          options: _getPrismOptions(options),
          isNode: isNode
      };

      return workerData;
  }

  /**
   * Browser Only - Sends messages to web worker to highlight elements passed
   * in
   *
   * @param {Array} codeBlocks
   * @param {Function} callback
   * @return {void}
   */
  function _highlightCodeBlocks(codeBlocks, callback) {
      var waitingOn = { c: 0 };
      for (var i = 0, list = codeBlocks; i < list.length; i += 1) {
          var block = list[i];

          var language = getLanguageForBlock(block);
          if (block.classList.contains('rainbow') || !language) {
              continue;
          }

          // This cancels the pending animation to fade the code in on load
          // since we want to delay doing this until it is actually
          // highlighted
          block.classList.add('loading');
          block.classList.add('rainbow');

          // We need to make sure to also add the loading class to the pre tag
          // because that is how we will know to show a preloader
          if (block.parentNode.tagName === 'PRE') {
              block.parentNode.classList.add('loading');
          }

          var globalClass = block.getAttribute('data-global-class');
          var delay = parseInt(block.getAttribute('data-delay'), 10);

          ++waitingOn.c;
          _messageWorker(_getWorkerData(block.innerHTML, { language: language, globalClass: globalClass, delay: delay }), _generateHandler(block, waitingOn, callback));
      }

      if (waitingOn.c === 0) {
          callback();
      }
  }

  function _addPreloader(preBlock) {
      var preloader = document.createElement('div');
      preloader.className = 'preloader';
      for (var i = 0; i < 7; i++) {
          preloader.appendChild(document.createElement('div'));
      }
      preBlock.appendChild(preloader);
  }

  /**
   * Browser Only - Start highlighting all the code blocks
   *
   * @param {Element} node       HTMLElement to search within
   * @param {Function} callback
   * @return {void}
   */
  function _highlight(node, callback) {
      callback = callback || function() {};

      // The first argument can be an Event or a DOM Element.
      //
      // I was originally checking instanceof Event but that made it break
      // when using mootools.
      //
      // @see https://github.com/ccampbell/rainbow/issues/32
      node = node && typeof node.getElementsByTagName === 'function' ? node : document;

      var preBlocks = node.getElementsByTagName('pre');
      var codeBlocks = node.getElementsByTagName('code');
      var finalPreBlocks = [];
      var finalCodeBlocks = [];

      // First loop through all pre blocks to find which ones to highlight
      for (var i = 0, list = preBlocks; i < list.length; i += 1) {
          var preBlock = list[i];

          _addPreloader(preBlock);

          // Strip whitespace around code tags when they are inside of a pre
          // tag.  This makes the themes look better because you can't
          // accidentally add extra linebreaks at the start and end.
          //
          // When the pre tag contains a code tag then strip any extra
          // whitespace.
          //
          // For example:
          //
          // <pre>
          //      <code>var foo = true;</code>
          // </pre>
          //
          // will become:
          //
          // <pre><code>var foo = true;</code></pre>
          //
          // If you want to preserve whitespace you can use a pre tag on
          // its own without a code tag inside of it.
          if (preBlock.getElementsByTagName('code').length) {

              // This fixes a race condition when Rainbow.color is called before
              // the previous color call has finished.
              if (!preBlock.getAttribute('data-trimmed')) {
                  preBlock.setAttribute('data-trimmed', true);
                  preBlock.innerHTML = preBlock.innerHTML.trim();
              }
              continue;
          }

          // If the pre block has no code blocks then we are going to want to
          // process it directly.
          finalPreBlocks.push(preBlock);
      }

      // @see http://stackoverflow.com/questions/2735067/how-to-convert-a-dom-node-list-to-an-array-in-javascript
      // We are going to process all <code> blocks
      for (var i$1 = 0, list$1 = codeBlocks; i$1 < list$1.length; i$1 += 1) {
          var codeBlock = list$1[i$1];

          finalCodeBlocks.push(codeBlock);
      }

      _highlightCodeBlocks(finalCodeBlocks.concat(finalPreBlocks), callback);
  }

  /**
   * Callback to let you do stuff in your app after a piece of code has
   * been highlighted
   *
   * @param {Function} callback
   * @return {void}
   */
  function onHighlight(callback) {
      onHighlightCallback = callback;
  }

  /**
   * Extends the language pattern matches
   *
   * @param {string} language            name of language
   * @param {object} languagePatterns    object of patterns to add on
   * @param {string|undefined} inherits  optional language that this language
   *                                     should inherit rules from
   */
  function extend(language, languagePatterns, inherits) {

      // If we extend a language again we shouldn't need to specify the
      // inheritence for it. For example, if you are adding special highlighting
      // for a javascript function that is not in the base javascript rules, you
      // should be able to do
      //
      // Rainbow.extend('javascript', [ … ]);
      //
      // Without specifying a language it should inherit (generic in this case)
      if (!inheritenceMap[language]) {
          inheritenceMap[language] = inherits;
      }

      patterns[language] = languagePatterns.concat(patterns[language] || []);
  }

  function remove(language) {
      delete inheritenceMap[language];
      delete patterns[language];
  }

  /**
   * Starts the magic rainbow
   *
   * @return {void}
   */
  function color() {
      var args = [], len = arguments.length;
      while ( len-- ) args[ len ] = arguments[ len ];


      // If you want to straight up highlight a string you can pass the
      // string of code, the language, and a callback function.
      //
      // Example:
      //
      // Rainbow.color(code, language, function(highlightedCode, language) {
      //     // this code block is now highlighted
      // });
      if (typeof args[0] === 'string') {
          var workerData = _getWorkerData(args[0], args[1]);
          _messageWorker(workerData, (function(cb) {
              return function(data) {
                  if (cb) {
                      cb(data.result, data.lang);
                  }
              };
          }(args[2])));
          return;
      }

      // If you pass a callback function then we rerun the color function
      // on all the code and call the callback function on complete.
      //
      // Example:
      //
      // Rainbow.color(function() {
      //     console.log('All matching tags on the page are now highlighted');
      // });
      if (typeof args[0] === 'function') {
          _highlight(0, args[0]);
          return;
      }

      // Otherwise we use whatever node you passed in with an optional
      // callback function as the second parameter.
      //
      // Example:
      //
      // var preElement = document.createElement('pre');
      // var codeElement = document.createElement('code');
      // codeElement.setAttribute('data-language', 'javascript');
      // codeElement.innerHTML = '// Here is some JavaScript';
      // preElement.appendChild(codeElement);
      // Rainbow.color(preElement, function() {
      //     // New element is now highlighted
      // });
      //
      // If you don't pass an element it will default to `document`
      _highlight(args[0], args[1]);
  }

  /**
   * Method to add an alias for an existing language.
   *
   * For example if you want to have "coffee" map to "coffeescript"
   *
   * @see https://github.com/ccampbell/rainbow/issues/154
   * @param {string} alias
   * @param {string} originalLanguage
   * @return {void}
   */
  function addAlias(alias, originalLanguage) {
      aliases[alias] = originalLanguage;
  }

  /**
   * public methods
   */
  Rainbow = {
      extend: extend,
      remove: remove,
      onHighlight: onHighlight,
      addAlias: addAlias,
      color: color
  };

  if (isNode) {
      Rainbow.colorSync = function(code, lang) {
          var workerData = _getWorkerData(code, lang);
          var prism = new Prism(workerData.options);
          return prism.refract(workerData.code, workerData.lang);
      };
  }

  // In the browser hook it up to color on page load
  if (!isNode && !isWorker) {
      document.addEventListener('DOMContentLoaded', function (event) {
          if (!Rainbow.defer) {
              Rainbow.color(event);
          }
      }, false);
  }

  // From a node worker, handle the postMessage requests to it
  if (isWorker) {
      self.onmessage = rainbowWorker;
  }

  var Rainbow$1 = Rainbow;

  return Rainbow$1;

}));
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL3NyYy91dGlsLmpzIiwiLi4vc3JjL3ByaXNtLmpzIiwiLi4vc3JjL3dvcmtlci5qcyIsIi4uL3NyYy9yYWluYm93LmpzIl0sInNvdXJjZXNDb250ZW50IjpbIlxuZXhwb3J0IGZ1bmN0aW9uIGlzTm9kZSgpIHtcbiAgcmV0dXJuIHR5cGVvZiBwcm9jZXNzICE9PSAndW5kZWZpbmVkJyAmJiBwcm9jZXNzLnZlcnNpb25zICE9IG51bGwgJiYgcHJvY2Vzcy52ZXJzaW9ucy5ub2RlICE9IG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1dvcmtlcigpIHtcbiAgICByZXR1cm4gdHlwZW9mIGRvY3VtZW50ID09PSAndW5kZWZpbmVkJyAmJiB0eXBlb2Ygc2VsZiAhPT0gJ3VuZGVmaW5lZCc7XG59XG5cbi8qKlxuICogQnJvd3NlciBPbmx5IC0gR2V0cyB0aGUgbGFuZ3VhZ2UgZm9yIHRoaXMgYmxvY2sgb2YgY29kZVxuICpcbiAqIEBwYXJhbSB7RWxlbWVudH0gYmxvY2tcbiAqIEByZXR1cm4ge3N0cmluZ3xudWxsfVxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGFuZ3VhZ2VGb3JCbG9jayhibG9jaykge1xuXG4gICAgLy8gSWYgdGhpcyBkb2Vzbid0IGhhdmUgYSBsYW5ndWFnZSBidXQgdGhlIHBhcmVudCBkb2VzIHRoZW4gdXNlIHRoYXQuXG4gICAgLy9cbiAgICAvLyBUaGlzIG1lYW5zIGlmIGZvciBleGFtcGxlIHlvdSBoYXZlOiA8cHJlIGRhdGEtbGFuZ3VhZ2U9XCJwaHBcIj5cbiAgICAvLyB3aXRoIGEgYnVuY2ggb2YgPGNvZGU+IGJsb2NrcyBpbnNpZGUgdGhlbiB5b3UgZG8gbm90IGhhdmVcbiAgICAvLyB0byBzcGVjaWZ5IHRoZSBsYW5ndWFnZSBmb3IgZWFjaCBibG9jay5cbiAgICBsZXQgbGFuZ3VhZ2UgPSBibG9jay5nZXRBdHRyaWJ1dGUoJ2RhdGEtbGFuZ3VhZ2UnKSB8fCBibG9jay5wYXJlbnROb2RlLmdldEF0dHJpYnV0ZSgnZGF0YS1sYW5ndWFnZScpO1xuXG4gICAgLy8gVGhpcyBhZGRzIHN1cHBvcnQgZm9yIHNwZWNpZnlpbmcgbGFuZ3VhZ2UgdmlhIGEgQ1NTIGNsYXNzLlxuICAgIC8vXG4gICAgLy8gWW91IGNhbiB1c2UgdGhlIEdvb2dsZSBDb2RlIFByZXR0aWZ5IHN0eWxlOiA8cHJlIGNsYXNzPVwibGFuZy1waHBcIj5cbiAgICAvLyBvciB0aGUgSFRNTDUgc3R5bGU6IDxwcmU+PGNvZGUgY2xhc3M9XCJsYW5ndWFnZS1waHBcIj5cbiAgICBpZiAoIWxhbmd1YWdlKSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm4gPSAvXFxibGFuZyg/OnVhZ2UpPy0oXFx3KykvO1xuICAgICAgICBjb25zdCBtYXRjaCA9IGJsb2NrLmNsYXNzTmFtZS5tYXRjaChwYXR0ZXJuKSB8fCBibG9jay5wYXJlbnROb2RlLmNsYXNzTmFtZS5tYXRjaChwYXR0ZXJuKTtcblxuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgIGxhbmd1YWdlID0gbWF0Y2hbMV07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobGFuZ3VhZ2UpIHtcbiAgICAgICAgcmV0dXJuIGxhbmd1YWdlLnRvTG93ZXJDYXNlKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG51bGw7XG59XG5cbi8qKlxuICogRGV0ZXJtaW5lcyBpZiB0d28gZGlmZmVyZW50IG1hdGNoZXMgaGF2ZSBjb21wbGV0ZSBvdmVybGFwIHdpdGggZWFjaCBvdGhlclxuICpcbiAqIEBwYXJhbSB7bnVtYmVyfSBzdGFydDEgICBzdGFydCBwb3NpdGlvbiBvZiBleGlzdGluZyBtYXRjaFxuICogQHBhcmFtIHtudW1iZXJ9IGVuZDEgICAgIGVuZCBwb3NpdGlvbiBvZiBleGlzdGluZyBtYXRjaFxuICogQHBhcmFtIHtudW1iZXJ9IHN0YXJ0MiAgIHN0YXJ0IHBvc2l0aW9uIG9mIG5ldyBtYXRjaFxuICogQHBhcmFtIHtudW1iZXJ9IGVuZDIgICAgIGVuZCBwb3NpdGlvbiBvZiBuZXcgbWF0Y2hcbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYXNDb21wbGV0ZU92ZXJsYXAoc3RhcnQxLCBlbmQxLCBzdGFydDIsIGVuZDIpIHtcblxuICAgIC8vIElmIHRoZSBzdGFydGluZyBhbmQgZW5kIHBvc2l0aW9ucyBhcmUgZXhhY3RseSB0aGUgc2FtZVxuICAgIC8vIHRoZW4gdGhlIGZpcnN0IG9uZSBzaG91bGQgc3RheSBhbmQgdGhpcyBvbmUgc2hvdWxkIGJlIGlnbm9yZWQuXG4gICAgaWYgKHN0YXJ0MiA9PT0gc3RhcnQxICYmIGVuZDIgPT09IGVuZDEpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiBzdGFydDIgPD0gc3RhcnQxICYmIGVuZDIgPj0gZW5kMTtcbn1cblxuLyoqXG4gKiBFbmNvZGVzIDwgYW5kID4gYXMgaHRtbCBlbnRpdGllc1xuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBjb2RlXG4gKiBAcmV0dXJuIHtzdHJpbmd9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBodG1sRW50aXRpZXMoY29kZSkge1xuICAgIHJldHVybiBjb2RlLnJlcGxhY2UoLzwvZywgJyZsdDsnKS5yZXBsYWNlKC8+L2csICcmZ3Q7JykucmVwbGFjZSgvJig/IVtcXHdcXCNdKzspL2csICcmYW1wOycpO1xufVxuXG4vKipcbiAqIEZpbmRzIG91dCB0aGUgcG9zaXRpb24gb2YgZ3JvdXAgbWF0Y2ggZm9yIGEgcmVndWxhciBleHByZXNzaW9uXG4gKlxuICogQHNlZSBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzE5ODU1OTQvaG93LXRvLWZpbmQtaW5kZXgtb2YtZ3JvdXBzLWluLW1hdGNoXG4gKiBAcGFyYW0ge09iamVjdH0gbWF0Y2hcbiAqIEBwYXJhbSB7bnVtYmVyfSBncm91cE51bWJlclxuICogQHJldHVybiB7bnVtYmVyfVxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5kZXhPZkdyb3VwKG1hdGNoLCBncm91cE51bWJlcikge1xuICAgIGxldCBpbmRleCA9IDA7XG5cbiAgICBmb3IgKGxldCBpID0gMTsgaSA8IGdyb3VwTnVtYmVyOyArK2kpIHtcbiAgICAgICAgaWYgKG1hdGNoW2ldKSB7XG4gICAgICAgICAgICBpbmRleCArPSBtYXRjaFtpXS5sZW5ndGg7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gaW5kZXg7XG59XG5cbi8qKlxuICogRGV0ZXJtaW5lcyBpZiBhIG5ldyBtYXRjaCBpbnRlcnNlY3RzIHdpdGggYW4gZXhpc3Rpbmcgb25lXG4gKlxuICogQHBhcmFtIHtudW1iZXJ9IHN0YXJ0MSAgICBzdGFydCBwb3NpdGlvbiBvZiBleGlzdGluZyBtYXRjaFxuICogQHBhcmFtIHtudW1iZXJ9IGVuZDEgICAgICBlbmQgcG9zaXRpb24gb2YgZXhpc3RpbmcgbWF0Y2hcbiAqIEBwYXJhbSB7bnVtYmVyfSBzdGFydDIgICAgc3RhcnQgcG9zaXRpb24gb2YgbmV3IG1hdGNoXG4gKiBAcGFyYW0ge251bWJlcn0gZW5kMiAgICAgIGVuZCBwb3NpdGlvbiBvZiBuZXcgbWF0Y2hcbiAqIEByZXR1cm4ge2Jvb2xlYW59XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnRlcnNlY3RzKHN0YXJ0MSwgZW5kMSwgc3RhcnQyLCBlbmQyKSB7XG4gICAgaWYgKHN0YXJ0MiA+PSBzdGFydDEgJiYgc3RhcnQyIDwgZW5kMSkge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZW5kMiA+IHN0YXJ0MSAmJiBlbmQyIDwgZW5kMTtcbn1cblxuLyoqXG4gKiBTb3J0cyBhbiBvYmplY3RzIGtleXMgYnkgaW5kZXggZGVzY2VuZGluZ1xuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3RcbiAqIEByZXR1cm4ge0FycmF5fVxuICovXG5leHBvcnQgZnVuY3Rpb24ga2V5cyhvYmplY3QpIHtcbiAgICBjb25zdCBsb2NhdGlvbnMgPSBbXTtcblxuICAgIGZvciAoY29uc3QgbG9jYXRpb24gaW4gb2JqZWN0KSB7XG4gICAgICAgIGlmIChvYmplY3QuaGFzT3duUHJvcGVydHkobG9jYXRpb24pKSB7XG4gICAgICAgICAgICBsb2NhdGlvbnMucHVzaChsb2NhdGlvbik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBudW1lcmljIGRlc2NlbmRpbmdcbiAgICByZXR1cm4gbG9jYXRpb25zLnNvcnQoKGEsIGIpID0+IGIgLSBhKTtcbn1cblxuLyoqXG4gKiBTdWJzdHJpbmcgcmVwbGFjZSBjYWxsIHRvIHJlcGxhY2UgcGFydCBvZiBhIHN0cmluZyBhdCBhIGNlcnRhaW4gcG9zaXRpb25cbiAqXG4gKiBAcGFyYW0ge251bWJlcn0gcG9zaXRpb24gICAgICAgICB0aGUgcG9zaXRpb24gd2hlcmUgdGhlIHJlcGxhY2VtZW50XG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaG91bGQgaGFwcGVuXG4gKiBAcGFyYW0ge3N0cmluZ30gcmVwbGFjZSAgICAgICAgICB0aGUgdGV4dCB3ZSB3YW50IHRvIHJlcGxhY2VcbiAqIEBwYXJhbSB7c3RyaW5nfSByZXBsYWNlV2l0aCAgICAgIHRoZSB0ZXh0IHdlIHdhbnQgdG8gcmVwbGFjZSBpdCB3aXRoXG4gKiBAcGFyYW0ge3N0cmluZ30gY29kZSAgICAgICAgICAgICB0aGUgY29kZSB3ZSBhcmUgZG9pbmcgdGhlIHJlcGxhY2luZyBpblxuICogQHJldHVybiB7c3RyaW5nfVxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVwbGFjZUF0UG9zaXRpb24ocG9zaXRpb24sIHJlcGxhY2UsIHJlcGxhY2VXaXRoLCBjb2RlKSB7XG4gICAgY29uc3Qgc3ViU3RyaW5nID0gY29kZS5zdWJzdHIocG9zaXRpb24pO1xuXG4gICAgLy8gVGhpcyBpcyBuZWVkZWQgdG8gZml4IGFuIGlzc3VlIHdoZXJlICQgc2lnbnMgZG8gbm90IHJlbmRlciBpbiB0aGVcbiAgICAvLyBoaWdobGlnaHRlZCBjb2RlXG4gICAgLy9cbiAgICAvLyBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9jY2FtcGJlbGwvcmFpbmJvdy9pc3N1ZXMvMjA4XG4gICAgcmVwbGFjZVdpdGggPSByZXBsYWNlV2l0aC5yZXBsYWNlKC9cXCQvZywgJyQkJCQnKVxuXG4gICAgcmV0dXJuIGNvZGUuc3Vic3RyKDAsIHBvc2l0aW9uKSArIHN1YlN0cmluZy5yZXBsYWNlKHJlcGxhY2UsIHJlcGxhY2VXaXRoKTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgdXNhYmxlIHdlYiB3b3JrZXIgZnJvbSBhbiBhbm9ueW1vdXMgZnVuY3Rpb25cbiAqXG4gKiBtb3N0bHkgYm9ycm93ZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vemV2ZXJvL3dvcmtlci1jcmVhdGVcbiAqXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmblxuICogQHBhcmFtIHtQcmlzbX0gUHJpc21cbiAqIEByZXR1cm4ge1dvcmtlcn1cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVdvcmtlcihmbiwgUHJpc20pIHtcbiAgICBpZiAoaXNOb2RlKCkpIHtcbiAgICAgICAgLyogZ2xvYmFscyBnbG9iYWwsIHJlcXVpcmUsIF9fZmlsZW5hbWUgKi9cbiAgICAgICAgLy8gRGlzYWJsZSByZXF1aXJlIHNvIGl0IGRvZXNuJ3QgdHJpZ2dlciBpbXBvcnRcbiAgICAgICAgLy8gZ2xvYmFsLldvcmtlciA9IHJlcXVpcmUoJ3dlYndvcmtlci10aHJlYWRzJykuV29ya2VyO1xuICAgICAgICByZXR1cm4gbmV3IFdvcmtlcihfX2ZpbGVuYW1lKTtcbiAgICB9XG5cbiAgICBjb25zdCBwcmlzbUZ1bmN0aW9uID0gUHJpc20udG9TdHJpbmcoKTtcblxuICAgIGxldCBjb2RlID0ga2V5cy50b1N0cmluZygpO1xuICAgIGNvZGUgKz0gaHRtbEVudGl0aWVzLnRvU3RyaW5nKCk7XG4gICAgY29kZSArPSBoYXNDb21wbGV0ZU92ZXJsYXAudG9TdHJpbmcoKTtcbiAgICBjb2RlICs9IGludGVyc2VjdHMudG9TdHJpbmcoKTtcbiAgICBjb2RlICs9IHJlcGxhY2VBdFBvc2l0aW9uLnRvU3RyaW5nKCk7XG4gICAgY29kZSArPSBpbmRleE9mR3JvdXAudG9TdHJpbmcoKTtcbiAgICBjb2RlICs9IHByaXNtRnVuY3Rpb247XG5cbiAgICBjb25zdCBmdWxsU3RyaW5nID0gYCR7Y29kZX1cXHR0aGlzLm9ubWVzc2FnZT0ke2ZuLnRvU3RyaW5nKCl9YDtcblxuICAgIGNvbnN0IGJsb2IgPSBuZXcgQmxvYihbZnVsbFN0cmluZ10sIHsgdHlwZTogJ3RleHQvamF2YXNjcmlwdCcgfSk7XG4gICAgcmV0dXJuIG5ldyBXb3JrZXIoKHdpbmRvdy5VUkwgfHwgd2luZG93LndlYmtpdFVSTCkuY3JlYXRlT2JqZWN0VVJMKGJsb2IpKTtcbn1cbiIsImltcG9ydCB7IHJlcGxhY2VBdFBvc2l0aW9uLCBpbmRleE9mR3JvdXAsIGtleXMsIGh0bWxFbnRpdGllcywgaGFzQ29tcGxldGVPdmVybGFwLCBpbnRlcnNlY3RzIH0gZnJvbSAnLi91dGlsJztcblxuLyoqXG4gKiBQcmlzbSBpcyBhIGNsYXNzIHVzZWQgdG8gaGlnaGxpZ2h0IGluZGl2aWR1YWwgYmxvY2tzIG9mIGNvZGVcbiAqXG4gKiBAY2xhc3NcbiAqL1xuY2xhc3MgUHJpc20ge1xuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqIE9iamVjdCBvZiByZXBsYWNlbWVudHMgdG8gcHJvY2VzcyBhdCB0aGUgZW5kIG9mIHRoZSBwcm9jZXNzaW5nXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtPYmplY3R9XG4gICAgICAgICAqL1xuICAgICAgICBjb25zdCByZXBsYWNlbWVudHMgPSB7fTtcblxuICAgICAgICAvKipcbiAgICAgICAgICogTGFuZ3VhZ2UgYXNzb2NpYXRlZCB3aXRoIHRoaXMgUHJpc20gb2JqZWN0XG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtzdHJpbmd9XG4gICAgICAgICAqL1xuICAgICAgICBsZXQgY3VycmVudExhbmd1YWdlO1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBPYmplY3Qgb2Ygc3RhcnQgYW5kIGVuZCBwb3NpdGlvbnMgb2YgYmxvY2tzIHRvIGJlIHJlcGxhY2VkXG4gICAgICAgICAqXG4gICAgICAgICAqIEB0eXBlIHtPYmplY3R9XG4gICAgICAgICAqL1xuICAgICAgICBjb25zdCByZXBsYWNlbWVudFBvc2l0aW9ucyA9IHt9O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBEZXRlcm1pbmVzIGlmIHRoZSBtYXRjaCBwYXNzZWQgaW4gZmFsbHMgaW5zaWRlIG9mIGFuIGV4aXN0aW5nIG1hdGNoLlxuICAgICAgICAgKiBUaGlzIHByZXZlbnRzIGEgcmVnZXggcGF0dGVybiBmcm9tIG1hdGNoaW5nIGluc2lkZSBvZiBhbm90aGVyIHBhdHRlcm5cbiAgICAgICAgICogdGhhdCBtYXRjaGVzIGEgbGFyZ2VyIGFtb3VudCBvZiBjb2RlLlxuICAgICAgICAgKlxuICAgICAgICAgKiBGb3IgZXhhbXBsZSB0aGlzIHByZXZlbnRzIGEga2V5d29yZCBmcm9tIG1hdGNoaW5nIGBmdW5jdGlvbmAgaWYgdGhlcmVcbiAgICAgICAgICogaXMgYWxyZWFkeSBhIG1hdGNoIGZvciBgZnVuY3Rpb24gKC4qKWAuXG4gICAgICAgICAqXG4gICAgICAgICAqIEBwYXJhbSB7bnVtYmVyfSBzdGFydCAgICBzdGFydCBwb3NpdGlvbiBvZiBuZXcgbWF0Y2hcbiAgICAgICAgICogQHBhcmFtIHtudW1iZXJ9IGVuZCAgICAgIGVuZCBwb3NpdGlvbiBvZiBuZXcgbWF0Y2hcbiAgICAgICAgICogQHJldHVybiB7Ym9vbGVhbn1cbiAgICAgICAgICovXG4gICAgICAgIGZ1bmN0aW9uIF9tYXRjaElzSW5zaWRlT3RoZXJNYXRjaChzdGFydCwgZW5kKSB7XG4gICAgICAgICAgICBmb3IgKGxldCBrZXkgaW4gcmVwbGFjZW1lbnRQb3NpdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBrZXkgPSBwYXJzZUludChrZXksIDEwKTtcblxuICAgICAgICAgICAgICAgIC8vIElmIHRoaXMgYmxvY2sgY29tcGxldGVseSBvdmVybGFwcyB3aXRoIGFub3RoZXIgYmxvY2tcbiAgICAgICAgICAgICAgICAvLyB0aGVuIHdlIHNob3VsZCByZW1vdmUgdGhlIG90aGVyIGJsb2NrIGFuZCByZXR1cm4gYGZhbHNlYC5cbiAgICAgICAgICAgICAgICBpZiAoaGFzQ29tcGxldGVPdmVybGFwKGtleSwgcmVwbGFjZW1lbnRQb3NpdGlvbnNba2V5XSwgc3RhcnQsIGVuZCkpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsZXRlIHJlcGxhY2VtZW50UG9zaXRpb25zW2tleV07XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSByZXBsYWNlbWVudHNba2V5XTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJzZWN0cyhrZXksIHJlcGxhY2VtZW50UG9zaXRpb25zW2tleV0sIHN0YXJ0LCBlbmQpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFRha2VzIGEgc3RyaW5nIG9mIGNvZGUgYW5kIHdyYXBzIGl0IGluIGEgc3BhbiB0YWcgYmFzZWQgb24gdGhlIG5hbWVcbiAgICAgICAgICpcbiAgICAgICAgICogQHBhcmFtIHtzdHJpbmd9IG5hbWUgICAgICAgIG5hbWUgb2YgdGhlIHBhdHRlcm4gKGllIGtleXdvcmQucmVnZXgpXG4gICAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjb2RlICAgICAgICBibG9jayBvZiBjb2RlIHRvIHdyYXBcbiAgICAgICAgICogQHBhcmFtIHtzdHJpbmd9IGdsb2JhbENsYXNzIGNsYXNzIHRvIGFwcGx5IHRvIGV2ZXJ5IHNwYW5cbiAgICAgICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAgICAgKi9cbiAgICAgICAgZnVuY3Rpb24gX3dyYXBDb2RlSW5TcGFuKG5hbWUsIGNvZGUpIHtcbiAgICAgICAgICAgIGxldCBjbGFzc05hbWUgPSBuYW1lLnJlcGxhY2UoL1xcLi9nLCAnICcpO1xuXG4gICAgICAgICAgICBjb25zdCBnbG9iYWxDbGFzcyA9IG9wdGlvbnMuZ2xvYmFsQ2xhc3M7XG4gICAgICAgICAgICBpZiAoZ2xvYmFsQ2xhc3MpIHtcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUgKz0gYCAke2dsb2JhbENsYXNzfWA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBgPHNwYW4gY2xhc3M9XCIke2NsYXNzTmFtZX1cIj4ke2NvZGV9PC9zcGFuPmA7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogUHJvY2VzcyByZXBsYWNlbWVudHMgaW4gdGhlIHN0cmluZyBvZiBjb2RlIHRvIGFjdHVhbGx5IHVwZGF0ZVxuICAgICAgICAgKiB0aGUgbWFya3VwXG4gICAgICAgICAqXG4gICAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjb2RlICAgICAgICAgdGhlIGNvZGUgdG8gcHJvY2VzcyByZXBsYWNlbWVudHMgaW5cbiAgICAgICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAgICAgKi9cbiAgICAgICAgZnVuY3Rpb24gX3Byb2Nlc3NSZXBsYWNlbWVudHMoY29kZSkge1xuICAgICAgICAgICAgY29uc3QgcG9zaXRpb25zID0ga2V5cyhyZXBsYWNlbWVudHMpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBwb3NpdGlvbiBvZiBwb3NpdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCByZXBsYWNlbWVudCA9IHJlcGxhY2VtZW50c1twb3NpdGlvbl07XG4gICAgICAgICAgICAgICAgY29kZSA9IHJlcGxhY2VBdFBvc2l0aW9uKHBvc2l0aW9uLCByZXBsYWNlbWVudC5yZXBsYWNlLCByZXBsYWNlbWVudC53aXRoLCBjb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBjb2RlO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEl0IGlzIHNvIHdlIGNhbiBjcmVhdGUgYSBuZXcgcmVnZXggb2JqZWN0IGZvciBlYWNoIGNhbGwgdG9cbiAgICAgICAgICogX3Byb2Nlc3NQYXR0ZXJuIHRvIGF2b2lkIHN0YXRlIGNhcnJ5aW5nIG92ZXIgd2hlbiBydW5uaW5nIGV4ZWNcbiAgICAgICAgICogbXVsdGlwbGUgdGltZXMuXG4gICAgICAgICAqXG4gICAgICAgICAqIFRoZSBnbG9iYWwgZmxhZyBzaG91bGQgbm90IGJlIGNhcnJpZWQgb3ZlciBiZWNhdXNlIHdlIGFyZSBzaW11bGF0aW5nXG4gICAgICAgICAqIGl0IGJ5IHByb2Nlc3NpbmcgdGhlIHJlZ2V4IGluIGEgbG9vcCBzbyB3ZSBvbmx5IGNhcmUgYWJvdXQgdGhlIGZpcnN0XG4gICAgICAgICAqIG1hdGNoIGluIGVhY2ggc3RyaW5nLiBUaGlzIGFsc28gc2VlbXMgdG8gaW1wcm92ZSBwZXJmb3JtYW5jZSBxdWl0ZSBhXG4gICAgICAgICAqIGJpdC5cbiAgICAgICAgICpcbiAgICAgICAgICogQHBhcmFtIHtSZWdFeHB9IHJlZ2V4XG4gICAgICAgICAqIEByZXR1cm4ge3N0cmluZ31cbiAgICAgICAgICovXG4gICAgICAgIGZ1bmN0aW9uIF9jbG9uZVJlZ2V4KHJlZ2V4KSB7XG4gICAgICAgICAgICBsZXQgZmxhZ3MgPSAnJztcblxuICAgICAgICAgICAgaWYgKHJlZ2V4Lmlnbm9yZUNhc2UpIHtcbiAgICAgICAgICAgICAgICBmbGFncyArPSAnaSc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChyZWdleC5tdWx0aWxpbmUpIHtcbiAgICAgICAgICAgICAgICBmbGFncyArPSAnbSc7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBuZXcgUmVnRXhwKHJlZ2V4LnNvdXJjZSwgZmxhZ3MpO1xuICAgICAgICB9XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIE1hdGNoZXMgYSByZWdleCBwYXR0ZXJuIGFnYWluc3QgYSBibG9jayBvZiBjb2RlLCBmaW5kcyBhbGwgbWF0Y2hlc1xuICAgICAgICAgKiB0aGF0IHNob3VsZCBiZSBwcm9jZXNzZWQsIGFuZCBzdG9yZXMgdGhlIHBvc2l0aW9ucyBvZiB3aGVyZSB0aGV5XG4gICAgICAgICAqIHNob3VsZCBiZSByZXBsYWNlZCB3aXRoaW4gdGhlIHN0cmluZy5cbiAgICAgICAgICpcbiAgICAgICAgICogVGhpcyBpcyB3aGVyZSBwcmV0dHkgbXVjaCBhbGwgdGhlIHdvcmsgaXMgZG9uZSBidXQgaXQgc2hvdWxkIG5vdFxuICAgICAgICAgKiBiZSBjYWxsZWQgZGlyZWN0bHkuXG4gICAgICAgICAqXG4gICAgICAgICAqIEBwYXJhbSB7T2JqZWN0fSBwYXR0ZXJuXG4gICAgICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjb2RlXG4gICAgICAgICAqIEBwYXJhbSB7bnVtYmVyfSBvZmZzZXRcbiAgICAgICAgICogQHJldHVybiB7bWl4ZWR9XG4gICAgICAgICAqL1xuICAgICAgICBmdW5jdGlvbiBfcHJvY2Vzc1BhdHRlcm4ocGF0dGVybiwgY29kZSwgb2Zmc2V0ID0gMCkge1xuICAgICAgICAgICAgbGV0IHJlZ2V4ID0gcGF0dGVybi5wYXR0ZXJuO1xuICAgICAgICAgICAgaWYgKCFyZWdleCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gU2luY2Ugd2UgYXJlIHNpbXVsYXRpbmcgZ2xvYmFsIHJlZ2V4IG1hdGNoaW5nIHdlIG5lZWQgdG8gYWxzb1xuICAgICAgICAgICAgLy8gbWFrZSBzdXJlIHRvIHN0b3AgYWZ0ZXIgb25lIG1hdGNoIGlmIHRoZSBwYXR0ZXJuIGlzIG5vdCBnbG9iYWxcbiAgICAgICAgICAgIGNvbnN0IHNob3VsZFN0b3AgPSAhcmVnZXguZ2xvYmFsO1xuXG4gICAgICAgICAgICByZWdleCA9IF9jbG9uZVJlZ2V4KHJlZ2V4KTtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gcmVnZXguZXhlYyhjb2RlKTtcbiAgICAgICAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFRyZWF0IG1hdGNoIDAgdGhlIHNhbWUgd2F5IGFzIG5hbWVcbiAgICAgICAgICAgIGlmICghcGF0dGVybi5uYW1lICYmIHBhdHRlcm4ubWF0Y2hlcyAmJiB0eXBlb2YgcGF0dGVybi5tYXRjaGVzWzBdID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHBhdHRlcm4ubmFtZSA9IHBhdHRlcm4ubWF0Y2hlc1swXTtcbiAgICAgICAgICAgICAgICBkZWxldGUgcGF0dGVybi5tYXRjaGVzWzBdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBsZXQgcmVwbGFjZW1lbnQgPSBtYXRjaFswXTtcbiAgICAgICAgICAgIGNvbnN0IHN0YXJ0UG9zID0gbWF0Y2guaW5kZXggKyBvZmZzZXQ7XG4gICAgICAgICAgICBjb25zdCBlbmRQb3MgPSBtYXRjaFswXS5sZW5ndGggKyBzdGFydFBvcztcblxuICAgICAgICAgICAgLy8gSW4gc29tZSBjYXNlcyB3aGVuIHRoZSByZWdleCBtYXRjaGVzIGEgZ3JvdXAgc3VjaCBhcyBcXHMqIGl0IGlzXG4gICAgICAgICAgICAvLyBwb3NzaWJsZSBmb3IgdGhlcmUgdG8gYmUgYSBtYXRjaCwgYnV0IGhhdmUgdGhlIHN0YXJ0IHBvc2l0aW9uXG4gICAgICAgICAgICAvLyBlcXVhbCB0aGUgZW5kIHBvc2l0aW9uLiBJbiB0aG9zZSBjYXNlcyB3ZSBzaG91bGQgYmUgYWJsZSB0byBzdG9wXG4gICAgICAgICAgICAvLyBtYXRjaGluZy4gT3RoZXJ3aXNlIHRoaXMgY2FuIGxlYWQgdG8gYW4gaW5maW5pdGUgbG9vcC5cbiAgICAgICAgICAgIGlmIChzdGFydFBvcyA9PT0gZW5kUG9zKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBJZiB0aGlzIGlzIG5vdCBhIGNoaWxkIG1hdGNoIGFuZCBpdCBmYWxscyBpbnNpZGUgb2YgYW5vdGhlclxuICAgICAgICAgICAgLy8gbWF0Y2ggdGhhdCBhbHJlYWR5IGhhcHBlbmVkIHdlIHNob3VsZCBza2lwIGl0IGFuZCBjb250aW51ZVxuICAgICAgICAgICAgLy8gcHJvY2Vzc2luZy5cbiAgICAgICAgICAgIGlmIChfbWF0Y2hJc0luc2lkZU90aGVyTWF0Y2goc3RhcnRQb3MsIGVuZFBvcykpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICByZW1haW5pbmc6IGNvZGUuc3Vic3RyKGVuZFBvcyAtIG9mZnNldCksXG4gICAgICAgICAgICAgICAgICAgIG9mZnNldDogZW5kUG9zXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgKiBDYWxsYmFjayBmb3Igd2hlbiBhIG1hdGNoIHdhcyBzdWNjZXNzZnVsbHkgcHJvY2Vzc2VkXG4gICAgICAgICAgICAgKlxuICAgICAgICAgICAgICogQHBhcmFtIHtzdHJpbmd9IHJlcGxcbiAgICAgICAgICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIGZ1bmN0aW9uIG9uTWF0Y2hTdWNjZXNzKHJlcGwpIHtcblxuICAgICAgICAgICAgICAgIC8vIElmIHRoaXMgbWF0Y2ggaGFzIGEgbmFtZSB0aGVuIHdyYXAgaXQgaW4gYSBzcGFuIHRhZ1xuICAgICAgICAgICAgICAgIGlmIChwYXR0ZXJuLm5hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVwbCA9IF93cmFwQ29kZUluU3BhbihwYXR0ZXJuLm5hbWUsIHJlcGwpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIEZvciBkZWJ1Z2dpbmdcbiAgICAgICAgICAgICAgICAvLyBjb25zb2xlLmxvZygnUmVwbGFjZSAnICsgbWF0Y2hbMF0gKyAnIHdpdGggJyArIHJlcGxhY2VtZW50ICsgJyBhdCBwb3NpdGlvbiAnICsgc3RhcnRQb3MgKyAnIHRvICcgKyBlbmRQb3MpO1xuXG4gICAgICAgICAgICAgICAgLy8gU3RvcmUgd2hhdCBuZWVkcyB0byBiZSByZXBsYWNlZCB3aXRoIHdoYXQgYXQgdGhpcyBwb3NpdGlvblxuICAgICAgICAgICAgICAgIHJlcGxhY2VtZW50c1tzdGFydFBvc10gPSB7XG4gICAgICAgICAgICAgICAgICAgICdyZXBsYWNlJzogbWF0Y2hbMF0sXG4gICAgICAgICAgICAgICAgICAgICd3aXRoJzogcmVwbFxuICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAvLyBTdG9yZSB0aGUgcmFuZ2Ugb2YgdGhpcyBtYXRjaCBzbyB3ZSBjYW4gdXNlIGl0IGZvclxuICAgICAgICAgICAgICAgIC8vIGNvbXBhcmlzb25zIHdpdGggb3RoZXIgbWF0Y2hlcyBsYXRlci5cbiAgICAgICAgICAgICAgICByZXBsYWNlbWVudFBvc2l0aW9uc1tzdGFydFBvc10gPSBlbmRQb3M7XG5cbiAgICAgICAgICAgICAgICBpZiAoc2hvdWxkU3RvcCkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgcmVtYWluaW5nOiBjb2RlLnN1YnN0cihlbmRQb3MgLSBvZmZzZXQpLFxuICAgICAgICAgICAgICAgICAgICBvZmZzZXQ6IGVuZFBvc1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8qKlxuICAgICAgICAgICAgICogSGVscGVyIGZ1bmN0aW9uIGZvciBwcm9jZXNzaW5nIGEgc3ViIGdyb3VwXG4gICAgICAgICAgICAgKlxuICAgICAgICAgICAgICogQHBhcmFtIHtudW1iZXJ9IGdyb3VwS2V5ICAgICAgaW5kZXggb2YgZ3JvdXBcbiAgICAgICAgICAgICAqIEByZXR1cm4ge3ZvaWR9XG4gICAgICAgICAgICAgKi9cbiAgICAgICAgICAgIGZ1bmN0aW9uIF9wcm9jZXNzR3JvdXAoZ3JvdXBLZXkpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBibG9jayA9IG1hdGNoW2dyb3VwS2V5XTtcblxuICAgICAgICAgICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIG1hdGNoIGhlcmUgdGhlbiBtb3ZlIG9uXG4gICAgICAgICAgICAgICAgaWYgKCFibG9jaykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgY29uc3QgZ3JvdXAgPSBwYXR0ZXJuLm1hdGNoZXNbZ3JvdXBLZXldO1xuICAgICAgICAgICAgICAgIGNvbnN0IGxhbmd1YWdlID0gZ3JvdXAubGFuZ3VhZ2U7XG5cbiAgICAgICAgICAgICAgICAvKipcbiAgICAgICAgICAgICAgICAgKiBQcm9jZXNzIGdyb3VwIGlzIHdoYXQgZ3JvdXAgd2Ugc2hvdWxkIHVzZSB0byBhY3R1YWxseSBwcm9jZXNzXG4gICAgICAgICAgICAgICAgICogdGhpcyBtYXRjaCBncm91cC5cbiAgICAgICAgICAgICAgICAgKlxuICAgICAgICAgICAgICAgICAqIEZvciBleGFtcGxlIGlmIHRoZSBzdWJncm91cCBwYXR0ZXJuIGxvb2tzIGxpa2UgdGhpczpcbiAgICAgICAgICAgICAgICAgKlxuICAgICAgICAgICAgICAgICAqIDI6IHtcbiAgICAgICAgICAgICAgICAgKiAgICAgJ25hbWUnOiAna2V5d29yZCcsXG4gICAgICAgICAgICAgICAgICogICAgICdwYXR0ZXJuJzogL3RydWUvZ1xuICAgICAgICAgICAgICAgICAqIH1cbiAgICAgICAgICAgICAgICAgKlxuICAgICAgICAgICAgICAgICAqIHRoZW4gd2UgdXNlIHRoYXQgYXMgaXMsIGJ1dCBpZiBpdCBsb29rcyBsaWtlIHRoaXM6XG4gICAgICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAgICAgKiAyOiB7XG4gICAgICAgICAgICAgICAgICogICAgICduYW1lJzogJ2tleXdvcmQnLFxuICAgICAgICAgICAgICAgICAqICAgICAnbWF0Y2hlcyc6IHtcbiAgICAgICAgICAgICAgICAgKiAgICAgICAgICAnbmFtZSc6ICdzcGVjaWFsJyxcbiAgICAgICAgICAgICAgICAgKiAgICAgICAgICAncGF0dGVybic6IC93aGF0ZXZlci9nXG4gICAgICAgICAgICAgICAgICogICAgICB9XG4gICAgICAgICAgICAgICAgICogfVxuICAgICAgICAgICAgICAgICAqXG4gICAgICAgICAgICAgICAgICogd2UgdHJlYXQgdGhlICdtYXRjaGVzJyBwYXJ0IGFzIHRoZSBwYXR0ZXJuIGFuZCBrZWVwXG4gICAgICAgICAgICAgICAgICogdGhlIG5hbWUgYXJvdW5kIHRvIHdyYXAgaXQgd2l0aCBsYXRlclxuICAgICAgICAgICAgICAgICAqL1xuICAgICAgICAgICAgICAgIGNvbnN0IGdyb3VwVG9Qcm9jZXNzID0gZ3JvdXAubmFtZSAmJiBncm91cC5tYXRjaGVzID8gZ3JvdXAubWF0Y2hlcyA6IGdyb3VwO1xuXG4gICAgICAgICAgICAgICAgLyoqXG4gICAgICAgICAgICAgICAgICogVGFrZXMgdGhlIGNvZGUgYmxvY2sgbWF0Y2hlZCBhdCB0aGlzIGdyb3VwLCByZXBsYWNlcyBpdFxuICAgICAgICAgICAgICAgICAqIHdpdGggdGhlIGhpZ2hsaWdodGVkIGJsb2NrLCBhbmQgb3B0aW9uYWxseSB3cmFwcyBpdCB3aXRoXG4gICAgICAgICAgICAgICAgICogYSBzcGFuIHdpdGggYSBuYW1lXG4gICAgICAgICAgICAgICAgICpcbiAgICAgICAgICAgICAgICAgKiBAcGFyYW0ge3N0cmluZ30gcGFzc2VkQmxvY2tcbiAgICAgICAgICAgICAgICAgKiBAcGFyYW0ge3N0cmluZ30gcmVwbGFjZUJsb2NrXG4gICAgICAgICAgICAgICAgICogQHBhcmFtIHtzdHJpbmd8bnVsbH0gbWF0Y2hOYW1lXG4gICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgY29uc3QgX2dldFJlcGxhY2VtZW50ID0gZnVuY3Rpb24ocGFzc2VkQmxvY2ssIHJlcGxhY2VCbG9jaywgbWF0Y2hOYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlcGxhY2VtZW50ID0gcmVwbGFjZUF0UG9zaXRpb24oaW5kZXhPZkdyb3VwKG1hdGNoLCBncm91cEtleSksIHBhc3NlZEJsb2NrLCBtYXRjaE5hbWUgPyBfd3JhcENvZGVJblNwYW4obWF0Y2hOYW1lLCByZXBsYWNlQmxvY2spIDogcmVwbGFjZUJsb2NrLCByZXBsYWNlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhpcyBpcyBhIHN0cmluZyB0aGVuIHRoaXMgbWF0Y2ggaXMgZGlyZWN0bHkgbWFwcGVkXG4gICAgICAgICAgICAgICAgLy8gdG8gc2VsZWN0b3Igc28gYWxsIHdlIGhhdmUgdG8gZG8gaXMgd3JhcCBpdCBpbiBhIHNwYW5cbiAgICAgICAgICAgICAgICAvLyBhbmQgY29udGludWUuXG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBncm91cCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAgICAgX2dldFJlcGxhY2VtZW50KGJsb2NrLCBibG9jaywgZ3JvdXApO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgbGV0IGxvY2FsQ29kZTtcbiAgICAgICAgICAgICAgICBjb25zdCBwcmlzbSA9IG5ldyBQcmlzbShvcHRpb25zKTtcblxuICAgICAgICAgICAgICAgIC8vIElmIHRoaXMgaXMgYSBzdWJsYW5ndWFnZSBnbyBhbmQgcHJvY2VzcyB0aGUgYmxvY2sgdXNpbmdcbiAgICAgICAgICAgICAgICAvLyB0aGF0IGxhbmd1YWdlXG4gICAgICAgICAgICAgICAgaWYgKGxhbmd1YWdlKSB7XG4gICAgICAgICAgICAgICAgICAgIGxvY2FsQ29kZSA9IHByaXNtLnJlZnJhY3QoYmxvY2ssIGxhbmd1YWdlKTtcbiAgICAgICAgICAgICAgICAgICAgX2dldFJlcGxhY2VtZW50KGJsb2NrLCBsb2NhbENvZGUpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gVGhlIHByb2Nlc3MgZ3JvdXAgY2FuIGJlIGEgc2luZ2xlIHBhdHRlcm4gb3IgYW4gYXJyYXkgb2ZcbiAgICAgICAgICAgICAgICAvLyBwYXR0ZXJucy4gYF9wcm9jZXNzQ29kZVdpdGhQYXR0ZXJuc2AgYWx3YXlzIGV4cGVjdHMgYW4gYXJyYXlcbiAgICAgICAgICAgICAgICAvLyBzbyB3ZSBjb252ZXJ0IGl0IGhlcmUuXG4gICAgICAgICAgICAgICAgbG9jYWxDb2RlID0gcHJpc20ucmVmcmFjdChibG9jaywgY3VycmVudExhbmd1YWdlLCBncm91cFRvUHJvY2Vzcy5sZW5ndGggPyBncm91cFRvUHJvY2VzcyA6IFtncm91cFRvUHJvY2Vzc10pO1xuICAgICAgICAgICAgICAgIF9nZXRSZXBsYWNlbWVudChibG9jaywgbG9jYWxDb2RlLCBncm91cC5tYXRjaGVzID8gZ3JvdXAubmFtZSA6IDApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBJZiB0aGlzIHBhdHRlcm4gaGFzIHN1YiBtYXRjaGVzIGZvciBkaWZmZXJlbnQgZ3JvdXBzIGluIHRoZSByZWdleFxuICAgICAgICAgICAgLy8gdGhlbiB3ZSBzaG91bGQgcHJvY2VzcyB0aGVtIG9uZSBhdCBhIHRpbWUgYnkgcnVubmluZyB0aGVtIHRocm91Z2hcbiAgICAgICAgICAgIC8vIHRoZSBfcHJvY2Vzc0dyb3VwIGZ1bmN0aW9uIHRvIGdlbmVyYXRlIHRoZSBuZXcgcmVwbGFjZW1lbnQuXG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgLy8gV2UgdXNlIHRoZSBga2V5c2AgZnVuY3Rpb24gdG8gcnVuIHRocm91Z2ggdGhlbSBiYWNrd2FyZHMgYmVjYXVzZVxuICAgICAgICAgICAgLy8gdGhlIG1hdGNoIHBvc2l0aW9uIG9mIGVhcmxpZXIgbWF0Y2hlcyB3aWxsIG5vdCBjaGFuZ2UgZGVwZW5kaW5nXG4gICAgICAgICAgICAvLyBvbiB3aGF0IGdldHMgcmVwbGFjZWQgaW4gbGF0ZXIgbWF0Y2hlcy5cbiAgICAgICAgICAgIGNvbnN0IGdyb3VwS2V5cyA9IGtleXMocGF0dGVybi5tYXRjaGVzKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgZ3JvdXBLZXkgb2YgZ3JvdXBLZXlzKSB7XG4gICAgICAgICAgICAgICAgX3Byb2Nlc3NHcm91cChncm91cEtleSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEZpbmFsbHksIGNhbGwgYG9uTWF0Y2hTdWNjZXNzYCB3aXRoIHRoZSByZXBsYWNlbWVudFxuICAgICAgICAgICAgcmV0dXJuIG9uTWF0Y2hTdWNjZXNzKHJlcGxhY2VtZW50KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBQcm9jZXNzZXMgYSBibG9jayBvZiBjb2RlIHVzaW5nIHNwZWNpZmllZCBwYXR0ZXJuc1xuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0ge3N0cmluZ30gY29kZVxuICAgICAgICAgKiBAcGFyYW0ge0FycmF5fSBwYXR0ZXJuc1xuICAgICAgICAgKiBAcmV0dXJuIHtzdHJpbmd9XG4gICAgICAgICAqL1xuICAgICAgICBmdW5jdGlvbiBfcHJvY2Vzc0NvZGVXaXRoUGF0dGVybnMoY29kZSwgcGF0dGVybnMpIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcGF0dGVybiBvZiBwYXR0ZXJucykge1xuICAgICAgICAgICAgICAgIGxldCByZXN1bHQgPSBfcHJvY2Vzc1BhdHRlcm4ocGF0dGVybiwgY29kZSk7XG4gICAgICAgICAgICAgICAgd2hpbGUgKHJlc3VsdCkge1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQgPSBfcHJvY2Vzc1BhdHRlcm4ocGF0dGVybiwgcmVzdWx0LnJlbWFpbmluZywgcmVzdWx0Lm9mZnNldCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBXZSBhcmUgZG9uZSBwcm9jZXNzaW5nIHRoZSBwYXR0ZXJucyBzbyB3ZSBzaG91bGQgYWN0dWFsbHkgcmVwbGFjZVxuICAgICAgICAgICAgLy8gd2hhdCBuZWVkcyB0byBiZSByZXBsYWNlZCBpbiB0aGUgY29kZS5cbiAgICAgICAgICAgIHJldHVybiBfcHJvY2Vzc1JlcGxhY2VtZW50cyhjb2RlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZXR1cm5zIGEgbGlzdCBvZiByZWdleCBwYXR0ZXJucyBmb3IgdGhpcyBsYW5ndWFnZVxuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0ge3N0cmluZ30gbGFuZ3VhZ2VcbiAgICAgICAgICogQHJldHVybiB7QXJyYXl9XG4gICAgICAgICAqL1xuICAgICAgICBmdW5jdGlvbiBnZXRQYXR0ZXJuc0Zvckxhbmd1YWdlKGxhbmd1YWdlKSB7XG4gICAgICAgICAgICBsZXQgcGF0dGVybnMgPSBvcHRpb25zLnBhdHRlcm5zW2xhbmd1YWdlXSB8fCBbXTtcbiAgICAgICAgICAgIHdoaWxlIChvcHRpb25zLmluaGVyaXRlbmNlTWFwW2xhbmd1YWdlXSkge1xuICAgICAgICAgICAgICAgIGxhbmd1YWdlID0gb3B0aW9ucy5pbmhlcml0ZW5jZU1hcFtsYW5ndWFnZV07XG4gICAgICAgICAgICAgICAgcGF0dGVybnMgPSBwYXR0ZXJucy5jb25jYXQob3B0aW9ucy5wYXR0ZXJuc1tsYW5ndWFnZV0gfHwgW10pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcGF0dGVybnM7XG4gICAgICAgIH1cblxuICAgICAgICAvKipcbiAgICAgICAgICogVGFrZXMgYSBzdHJpbmcgb2YgY29kZSBhbmQgaGlnaGxpZ2h0cyBpdCBhY2NvcmRpbmcgdG8gdGhlIGxhbmd1YWdlXG4gICAgICAgICAqIHNwZWNpZmllZFxuICAgICAgICAgKlxuICAgICAgICAgKiBAcGFyYW0ge3N0cmluZ30gY29kZVxuICAgICAgICAgKiBAcGFyYW0ge3N0cmluZ30gbGFuZ3VhZ2VcbiAgICAgICAgICogQHBhcmFtIHtvYmplY3R9IHBhdHRlcm5zIG9wdGlvbmFsbHkgc3BlY2lmeSBhIGxpc3Qgb2YgcGF0dGVybnNcbiAgICAgICAgICogQHJldHVybiB7c3RyaW5nfVxuICAgICAgICAgKi9cbiAgICAgICAgZnVuY3Rpb24gX2hpZ2hsaWdodEJsb2NrRm9yTGFuZ3VhZ2UoY29kZSwgbGFuZ3VhZ2UsIHBhdHRlcm5zKSB7XG4gICAgICAgICAgICBjdXJyZW50TGFuZ3VhZ2UgPSBsYW5ndWFnZTtcbiAgICAgICAgICAgIHBhdHRlcm5zID0gcGF0dGVybnMgfHwgZ2V0UGF0dGVybnNGb3JMYW5ndWFnZShsYW5ndWFnZSk7XG4gICAgICAgICAgICByZXR1cm4gX3Byb2Nlc3NDb2RlV2l0aFBhdHRlcm5zKGh0bWxFbnRpdGllcyhjb2RlKSwgcGF0dGVybnMpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5yZWZyYWN0ID0gX2hpZ2hsaWdodEJsb2NrRm9yTGFuZ3VhZ2U7XG4gICAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBQcmlzbTtcbiIsImltcG9ydCBQcmlzbSBmcm9tICcuL3ByaXNtJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gcmFpbmJvd1dvcmtlcihlKSB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGUuZGF0YTtcblxuICAgIGNvbnN0IHByaXNtID0gbmV3IFByaXNtKG1lc3NhZ2Uub3B0aW9ucyk7XG4gICAgY29uc3QgcmVzdWx0ID0gcHJpc20ucmVmcmFjdChtZXNzYWdlLmNvZGUsIG1lc3NhZ2UubGFuZyk7XG5cbiAgICBmdW5jdGlvbiBfcmVwbHkoKSB7XG4gICAgICAgIHNlbGYucG9zdE1lc3NhZ2Uoe1xuICAgICAgICAgICAgaWQ6IG1lc3NhZ2UuaWQsXG4gICAgICAgICAgICBsYW5nOiBtZXNzYWdlLmxhbmcsXG4gICAgICAgICAgICByZXN1bHRcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gSSByZWFsaXplZCBkb3duIHRoZSByb2FkIEkgbWlnaHQgbG9vayBhdCB0aGlzIGFuZCB3b25kZXIgd2hhdCBpcyBnb2luZyBvblxuICAgIC8vIHNvIHByb2JhYmx5IGl0IGlzIG5vdCBhIGJhZCBpZGVhIHRvIGxlYXZlIGEgY29tbWVudC5cbiAgICAvL1xuICAgIC8vIFRoaXMgaXMgbmVlZGVkIGJlY2F1c2UgcmlnaHQgbm93IHRoZSBub2RlIGxpYnJhcnkgZm9yIHNpbXVsYXRpbmcgd2ViXG4gICAgLy8gd29ya2VycyDigJx3ZWJ3b3JrZXItdGhyZWFkc+KAnSB3aWxsIGtlZXAgdGhlIHdvcmtlciBvcGVuIGFuZCBpdCBjYXVzZXNcbiAgICAvLyBzY3JpcHRzIHJ1bm5pbmcgZnJvbSB0aGUgY29tbWFuZCBsaW5lIHRvIGhhbmcgdW5sZXNzIHRoZSB3b3JrZXIgaXNcbiAgICAvLyBleHBsaWNpdGx5IGNsb3NlZC5cbiAgICAvL1xuICAgIC8vIFRoaXMgbWVhbnMgZm9yIG5vZGUgd2Ugd2lsbCBzcGF3biBhIG5ldyB0aHJlYWQgZm9yIGV2ZXJ5IGFzeW5jaHJvbm91c1xuICAgIC8vIGJsb2NrIHdlIGFyZSBoaWdobGlnaHRpbmcsIGJ1dCBpbiB0aGUgYnJvd3NlciB3ZSB3aWxsIGtlZXAgYSBzaW5nbGVcbiAgICAvLyB3b3JrZXIgb3BlbiBmb3IgYWxsIHJlcXVlc3RzLlxuICAgIGlmIChtZXNzYWdlLmlzTm9kZSkge1xuICAgICAgICBfcmVwbHkoKTtcbiAgICAgICAgc2VsZi5jbG9zZSgpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIF9yZXBseSgpO1xuICAgIH0sIG1lc3NhZ2Uub3B0aW9ucy5kZWxheSAqIDEwMDApO1xufVxuIiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxMi0yMDE2IENyYWlnIENhbXBiZWxsXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKlxuICogUmFpbmJvdyBpcyBhIHNpbXBsZSBjb2RlIHN5bnRheCBoaWdobGlnaHRlclxuICpcbiAqIEBzZWUgcmFpbmJvd2NvLmRlXG4gKi9cbmltcG9ydCBQcmlzbSBmcm9tICcuL3ByaXNtJztcbmltcG9ydCB7IGlzTm9kZSBhcyB1dGlsSXNOb2RlLCBpc1dvcmtlciBhcyB1dGlsSXNXb3JrZXIsIGNyZWF0ZVdvcmtlciwgZ2V0TGFuZ3VhZ2VGb3JCbG9jayB9IGZyb20gJy4vdXRpbCc7XG5pbXBvcnQgcmFpbmJvd1dvcmtlciBmcm9tICcuL3dvcmtlcic7XG5cbi8qKlxuICogQW4gYXJyYXkgb2YgdGhlIGxhbmd1YWdlIHBhdHRlcm5zIHNwZWNpZmllZCBmb3IgZWFjaCBsYW5ndWFnZVxuICpcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cbmNvbnN0IHBhdHRlcm5zID0ge307XG5cbi8qKlxuICogQW4gb2JqZWN0IG9mIGxhbmd1YWdlcyBtYXBwaW5nIHRvIHdoYXQgbGFuZ3VhZ2UgdGhleSBzaG91bGQgaW5oZXJpdCBmcm9tXG4gKlxuICogQHR5cGUge09iamVjdH1cbiAqL1xuY29uc3QgaW5oZXJpdGVuY2VNYXAgPSB7fTtcblxuLyoqXG4gKiBBIG1hcHBpbmcgb2YgbGFuZ3VhZ2UgYWxpYXNlc1xuICpcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cbmNvbnN0IGFsaWFzZXMgPSB7fTtcblxuLyoqXG4gKiBSZXByZXNlbnRhdGlvbiBvZiB0aGUgYWN0dWFsIHJhaW5ib3cgb2JqZWN0XG4gKlxuICogQHR5cGUge09iamVjdH1cbiAqL1xubGV0IFJhaW5ib3cgPSB7fTtcblxuLyoqXG4gKiBDYWxsYmFjayB0byBmaXJlIGFmdGVyIGVhY2ggYmxvY2sgaXMgaGlnaGxpZ2h0ZWRcbiAqXG4gKiBAdHlwZSB7bnVsbHxGdW5jdGlvbn1cbiAqL1xubGV0IG9uSGlnaGxpZ2h0Q2FsbGJhY2s7XG5cbi8qKlxuICogQ291bnRlciBmb3IgYmxvY2sgaWRzXG4gKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9jY2FtcGJlbGwvcmFpbmJvdy9pc3N1ZXMvMjA3XG4gKi9cbmxldCBpZCA9IDA7XG5cbmNvbnN0IGlzTm9kZSA9IHV0aWxJc05vZGUoKTtcbmNvbnN0IGlzV29ya2VyID0gdXRpbElzV29ya2VyKCk7XG5cbmxldCBjYWNoZWRXb3JrZXIgPSBudWxsO1xuZnVuY3Rpb24gX2dldFdvcmtlcigpIHtcbiAgICBpZiAoaXNOb2RlIHx8IGNhY2hlZFdvcmtlciA9PT0gbnVsbCkge1xuICAgICAgICBjYWNoZWRXb3JrZXIgPSBjcmVhdGVXb3JrZXIocmFpbmJvd1dvcmtlciwgUHJpc20pO1xuICAgIH1cblxuICAgIHJldHVybiBjYWNoZWRXb3JrZXI7XG59XG5cbi8qKlxuICogSGVscGVyIGZvciBtYXRjaGluZyB1cCBjYWxsYmFja3MgZGlyZWN0bHkgd2l0aCB0aGVcbiAqIHBvc3QgbWVzc2FnZSByZXF1ZXN0cyB0byBhIHdlYiB3b3JrZXIuXG4gKlxuICogQHBhcmFtIHtvYmplY3R9IG1lc3NhZ2UgICAgICBkYXRhIHRvIHNlbmQgdG8gd2ViIHdvcmtlclxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgICBjYWxsYmFjayBmdW5jdGlvbiBmb3Igd29ya2VyIHRvIHJlcGx5IHRvXG4gKiBAcmV0dXJuIHt2b2lkfVxuICovXG5mdW5jdGlvbiBfbWVzc2FnZVdvcmtlcihtZXNzYWdlLCBjYWxsYmFjaykge1xuICAgIGNvbnN0IHdvcmtlciA9IF9nZXRXb3JrZXIoKTtcblxuICAgIGZ1bmN0aW9uIF9saXN0ZW4oZSkge1xuICAgICAgICBpZiAoZS5kYXRhLmlkID09PSBtZXNzYWdlLmlkKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhlLmRhdGEpO1xuICAgICAgICAgICAgd29ya2VyLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBfbGlzdGVuKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHdvcmtlci5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgX2xpc3Rlbik7XG4gICAgd29ya2VyLnBvc3RNZXNzYWdlKG1lc3NhZ2UpO1xufVxuXG4vKipcbiAqIEJyb3dzZXIgT25seSAtIEhhbmRsZXMgcmVzcG9uc2UgZnJvbSB3ZWIgd29ya2VyLCB1cGRhdGVzIERPTSB3aXRoXG4gKiByZXN1bHRpbmcgY29kZSwgYW5kIGZpcmVzIGNhbGxiYWNrXG4gKlxuICogQHBhcmFtIHtFbGVtZW50fSBlbGVtZW50XG4gKiBAcGFyYW0ge29iamVjdH0gd2FpdGluZ09uXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFja1xuICogQHJldHVybiB7dm9pZH1cbiAqL1xuZnVuY3Rpb24gX2dlbmVyYXRlSGFuZGxlcihlbGVtZW50LCB3YWl0aW5nT24sIGNhbGxiYWNrKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uIF9oYW5kbGVSZXNwb25zZUZyb21Xb3JrZXIoZGF0YSkge1xuICAgICAgICBlbGVtZW50LmlubmVySFRNTCA9IGRhdGEucmVzdWx0O1xuICAgICAgICBlbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2xvYWRpbmcnKTtcbiAgICAgICAgZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdyYWluYm93LXNob3cnKTtcblxuICAgICAgICBpZiAoZWxlbWVudC5wYXJlbnROb2RlLnRhZ05hbWUgPT09ICdQUkUnKSB7XG4gICAgICAgICAgICBlbGVtZW50LnBhcmVudE5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnbG9hZGluZycpO1xuICAgICAgICAgICAgZWxlbWVudC5wYXJlbnROb2RlLmNsYXNzTGlzdC5hZGQoJ3JhaW5ib3ctc2hvdycpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKCdhbmltYXRpb25lbmQnLCAoZSkgPT4ge1xuICAgICAgICAvLyAgICAgaWYgKGUuYW5pbWF0aW9uTmFtZSA9PT0gJ2ZhZGUtaW4nKSB7XG4gICAgICAgIC8vICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIC8vICAgICAgICAgICAgIGVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZGVjcmVhc2UtZGVsYXknKTtcbiAgICAgICAgLy8gICAgICAgICB9LCAxMDAwKTtcbiAgICAgICAgLy8gICAgIH1cbiAgICAgICAgLy8gfSk7XG5cbiAgICAgICAgaWYgKG9uSGlnaGxpZ2h0Q2FsbGJhY2spIHtcbiAgICAgICAgICAgIG9uSGlnaGxpZ2h0Q2FsbGJhY2soZWxlbWVudCwgZGF0YS5sYW5nKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICgtLXdhaXRpbmdPbi5jID09PSAwKSB7XG4gICAgICAgICAgICBjYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgfTtcbn1cblxuLyoqXG4gKiBHZXRzIG9wdGlvbnMgbmVlZGVkIHRvIHBhc3MgaW50byBQcmlzbVxuICpcbiAqIEBwYXJhbSB7b2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtvYmplY3R9XG4gKi9cbmZ1bmN0aW9uIF9nZXRQcmlzbU9wdGlvbnMob3B0aW9ucykge1xuICAgIHJldHVybiB7XG4gICAgICAgIHBhdHRlcm5zLFxuICAgICAgICBpbmhlcml0ZW5jZU1hcCxcbiAgICAgICAgYWxpYXNlcyxcbiAgICAgICAgZ2xvYmFsQ2xhc3M6IG9wdGlvbnMuZ2xvYmFsQ2xhc3MsXG4gICAgICAgIGRlbGF5OiAhaXNOYU4ob3B0aW9ucy5kZWxheSkgPyBvcHRpb25zLmRlbGF5IDogMFxuICAgIH07XG59XG5cbi8qKlxuICogR2V0cyBkYXRhIHRvIHNlbmQgdG8gd2Vid29ya2VyXG4gKlxuICogQHBhcmFtICB7c3RyaW5nfSBjb2RlXG4gKiBAcGFyYW0gIHtzdHJpbmd9IGxhbmdcbiAqIEByZXR1cm4ge29iamVjdH1cbiAqL1xuZnVuY3Rpb24gX2dldFdvcmtlckRhdGEoY29kZSwgbGFuZykge1xuICAgIGxldCBvcHRpb25zID0ge307XG4gICAgaWYgKHR5cGVvZiBsYW5nID09PSAnb2JqZWN0Jykge1xuICAgICAgICBvcHRpb25zID0gbGFuZztcbiAgICAgICAgbGFuZyA9IG9wdGlvbnMubGFuZ3VhZ2U7XG4gICAgfVxuXG4gICAgbGFuZyA9IGFsaWFzZXNbbGFuZ10gfHwgbGFuZztcblxuICAgIGNvbnN0IHdvcmtlckRhdGEgPSB7XG4gICAgICAgIGlkOiBpZCsrLFxuICAgICAgICBjb2RlLFxuICAgICAgICBsYW5nLFxuICAgICAgICBvcHRpb25zOiBfZ2V0UHJpc21PcHRpb25zKG9wdGlvbnMpLFxuICAgICAgICBpc05vZGVcbiAgICB9O1xuXG4gICAgcmV0dXJuIHdvcmtlckRhdGE7XG59XG5cbi8qKlxuICogQnJvd3NlciBPbmx5IC0gU2VuZHMgbWVzc2FnZXMgdG8gd2ViIHdvcmtlciB0byBoaWdobGlnaHQgZWxlbWVudHMgcGFzc2VkXG4gKiBpblxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGNvZGVCbG9ja3NcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrXG4gKiBAcmV0dXJuIHt2b2lkfVxuICovXG5mdW5jdGlvbiBfaGlnaGxpZ2h0Q29kZUJsb2Nrcyhjb2RlQmxvY2tzLCBjYWxsYmFjaykge1xuICAgIGNvbnN0IHdhaXRpbmdPbiA9IHsgYzogMCB9O1xuICAgIGZvciAoY29uc3QgYmxvY2sgb2YgY29kZUJsb2Nrcykge1xuICAgICAgICBjb25zdCBsYW5ndWFnZSA9IGdldExhbmd1YWdlRm9yQmxvY2soYmxvY2spO1xuICAgICAgICBpZiAoYmxvY2suY2xhc3NMaXN0LmNvbnRhaW5zKCdyYWluYm93JykgfHwgIWxhbmd1YWdlKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoaXMgY2FuY2VscyB0aGUgcGVuZGluZyBhbmltYXRpb24gdG8gZmFkZSB0aGUgY29kZSBpbiBvbiBsb2FkXG4gICAgICAgIC8vIHNpbmNlIHdlIHdhbnQgdG8gZGVsYXkgZG9pbmcgdGhpcyB1bnRpbCBpdCBpcyBhY3R1YWxseVxuICAgICAgICAvLyBoaWdobGlnaHRlZFxuICAgICAgICBibG9jay5jbGFzc0xpc3QuYWRkKCdsb2FkaW5nJyk7XG4gICAgICAgIGJsb2NrLmNsYXNzTGlzdC5hZGQoJ3JhaW5ib3cnKTtcblxuICAgICAgICAvLyBXZSBuZWVkIHRvIG1ha2Ugc3VyZSB0byBhbHNvIGFkZCB0aGUgbG9hZGluZyBjbGFzcyB0byB0aGUgcHJlIHRhZ1xuICAgICAgICAvLyBiZWNhdXNlIHRoYXQgaXMgaG93IHdlIHdpbGwga25vdyB0byBzaG93IGEgcHJlbG9hZGVyXG4gICAgICAgIGlmIChibG9jay5wYXJlbnROb2RlLnRhZ05hbWUgPT09ICdQUkUnKSB7XG4gICAgICAgICAgICBibG9jay5wYXJlbnROb2RlLmNsYXNzTGlzdC5hZGQoJ2xvYWRpbmcnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGdsb2JhbENsYXNzID0gYmxvY2suZ2V0QXR0cmlidXRlKCdkYXRhLWdsb2JhbC1jbGFzcycpO1xuICAgICAgICBjb25zdCBkZWxheSA9IHBhcnNlSW50KGJsb2NrLmdldEF0dHJpYnV0ZSgnZGF0YS1kZWxheScpLCAxMCk7XG5cbiAgICAgICAgKyt3YWl0aW5nT24uYztcbiAgICAgICAgX21lc3NhZ2VXb3JrZXIoX2dldFdvcmtlckRhdGEoYmxvY2suaW5uZXJIVE1MLCB7IGxhbmd1YWdlLCBnbG9iYWxDbGFzcywgZGVsYXkgfSksIF9nZW5lcmF0ZUhhbmRsZXIoYmxvY2ssIHdhaXRpbmdPbiwgY2FsbGJhY2spKTtcbiAgICB9XG5cbiAgICBpZiAod2FpdGluZ09uLmMgPT09IDApIHtcbiAgICAgICAgY2FsbGJhY2soKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIF9hZGRQcmVsb2FkZXIocHJlQmxvY2spIHtcbiAgICBjb25zdCBwcmVsb2FkZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICBwcmVsb2FkZXIuY2xhc3NOYW1lID0gJ3ByZWxvYWRlcic7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCA3OyBpKyspIHtcbiAgICAgICAgcHJlbG9hZGVyLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcbiAgICB9XG4gICAgcHJlQmxvY2suYXBwZW5kQ2hpbGQocHJlbG9hZGVyKTtcbn1cblxuLyoqXG4gKiBCcm93c2VyIE9ubHkgLSBTdGFydCBoaWdobGlnaHRpbmcgYWxsIHRoZSBjb2RlIGJsb2Nrc1xuICpcbiAqIEBwYXJhbSB7RWxlbWVudH0gbm9kZSAgICAgICBIVE1MRWxlbWVudCB0byBzZWFyY2ggd2l0aGluXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFja1xuICogQHJldHVybiB7dm9pZH1cbiAqL1xuZnVuY3Rpb24gX2hpZ2hsaWdodChub2RlLCBjYWxsYmFjaykge1xuICAgIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgZnVuY3Rpb24oKSB7fTtcblxuICAgIC8vIFRoZSBmaXJzdCBhcmd1bWVudCBjYW4gYmUgYW4gRXZlbnQgb3IgYSBET00gRWxlbWVudC5cbiAgICAvL1xuICAgIC8vIEkgd2FzIG9yaWdpbmFsbHkgY2hlY2tpbmcgaW5zdGFuY2VvZiBFdmVudCBidXQgdGhhdCBtYWRlIGl0IGJyZWFrXG4gICAgLy8gd2hlbiB1c2luZyBtb290b29scy5cbiAgICAvL1xuICAgIC8vIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2NjYW1wYmVsbC9yYWluYm93L2lzc3Vlcy8zMlxuICAgIG5vZGUgPSBub2RlICYmIHR5cGVvZiBub2RlLmdldEVsZW1lbnRzQnlUYWdOYW1lID09PSAnZnVuY3Rpb24nID8gbm9kZSA6IGRvY3VtZW50O1xuXG4gICAgY29uc3QgcHJlQmxvY2tzID0gbm9kZS5nZXRFbGVtZW50c0J5VGFnTmFtZSgncHJlJyk7XG4gICAgY29uc3QgY29kZUJsb2NrcyA9IG5vZGUuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2NvZGUnKTtcbiAgICBjb25zdCBmaW5hbFByZUJsb2NrcyA9IFtdO1xuICAgIGNvbnN0IGZpbmFsQ29kZUJsb2NrcyA9IFtdO1xuXG4gICAgLy8gRmlyc3QgbG9vcCB0aHJvdWdoIGFsbCBwcmUgYmxvY2tzIHRvIGZpbmQgd2hpY2ggb25lcyB0byBoaWdobGlnaHRcbiAgICBmb3IgKGNvbnN0IHByZUJsb2NrIG9mIHByZUJsb2Nrcykge1xuICAgICAgICBfYWRkUHJlbG9hZGVyKHByZUJsb2NrKTtcblxuICAgICAgICAvLyBTdHJpcCB3aGl0ZXNwYWNlIGFyb3VuZCBjb2RlIHRhZ3Mgd2hlbiB0aGV5IGFyZSBpbnNpZGUgb2YgYSBwcmVcbiAgICAgICAgLy8gdGFnLiAgVGhpcyBtYWtlcyB0aGUgdGhlbWVzIGxvb2sgYmV0dGVyIGJlY2F1c2UgeW91IGNhbid0XG4gICAgICAgIC8vIGFjY2lkZW50YWxseSBhZGQgZXh0cmEgbGluZWJyZWFrcyBhdCB0aGUgc3RhcnQgYW5kIGVuZC5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gV2hlbiB0aGUgcHJlIHRhZyBjb250YWlucyBhIGNvZGUgdGFnIHRoZW4gc3RyaXAgYW55IGV4dHJhXG4gICAgICAgIC8vIHdoaXRlc3BhY2UuXG4gICAgICAgIC8vXG4gICAgICAgIC8vIEZvciBleGFtcGxlOlxuICAgICAgICAvL1xuICAgICAgICAvLyA8cHJlPlxuICAgICAgICAvLyAgICAgIDxjb2RlPnZhciBmb28gPSB0cnVlOzwvY29kZT5cbiAgICAgICAgLy8gPC9wcmU+XG4gICAgICAgIC8vXG4gICAgICAgIC8vIHdpbGwgYmVjb21lOlxuICAgICAgICAvL1xuICAgICAgICAvLyA8cHJlPjxjb2RlPnZhciBmb28gPSB0cnVlOzwvY29kZT48L3ByZT5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gSWYgeW91IHdhbnQgdG8gcHJlc2VydmUgd2hpdGVzcGFjZSB5b3UgY2FuIHVzZSBhIHByZSB0YWcgb25cbiAgICAgICAgLy8gaXRzIG93biB3aXRob3V0IGEgY29kZSB0YWcgaW5zaWRlIG9mIGl0LlxuICAgICAgICBpZiAocHJlQmxvY2suZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2NvZGUnKS5sZW5ndGgpIHtcblxuICAgICAgICAgICAgLy8gVGhpcyBmaXhlcyBhIHJhY2UgY29uZGl0aW9uIHdoZW4gUmFpbmJvdy5jb2xvciBpcyBjYWxsZWQgYmVmb3JlXG4gICAgICAgICAgICAvLyB0aGUgcHJldmlvdXMgY29sb3IgY2FsbCBoYXMgZmluaXNoZWQuXG4gICAgICAgICAgICBpZiAoIXByZUJsb2NrLmdldEF0dHJpYnV0ZSgnZGF0YS10cmltbWVkJykpIHtcbiAgICAgICAgICAgICAgICBwcmVCbG9jay5zZXRBdHRyaWJ1dGUoJ2RhdGEtdHJpbW1lZCcsIHRydWUpO1xuICAgICAgICAgICAgICAgIHByZUJsb2NrLmlubmVySFRNTCA9IHByZUJsb2NrLmlubmVySFRNTC50cmltKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoZSBwcmUgYmxvY2sgaGFzIG5vIGNvZGUgYmxvY2tzIHRoZW4gd2UgYXJlIGdvaW5nIHRvIHdhbnQgdG9cbiAgICAgICAgLy8gcHJvY2VzcyBpdCBkaXJlY3RseS5cbiAgICAgICAgZmluYWxQcmVCbG9ja3MucHVzaChwcmVCbG9jayk7XG4gICAgfVxuXG4gICAgLy8gQHNlZSBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vcXVlc3Rpb25zLzI3MzUwNjcvaG93LXRvLWNvbnZlcnQtYS1kb20tbm9kZS1saXN0LXRvLWFuLWFycmF5LWluLWphdmFzY3JpcHRcbiAgICAvLyBXZSBhcmUgZ29pbmcgdG8gcHJvY2VzcyBhbGwgPGNvZGU+IGJsb2Nrc1xuICAgIGZvciAoY29uc3QgY29kZUJsb2NrIG9mIGNvZGVCbG9ja3MpIHtcbiAgICAgICAgZmluYWxDb2RlQmxvY2tzLnB1c2goY29kZUJsb2NrKTtcbiAgICB9XG5cbiAgICBfaGlnaGxpZ2h0Q29kZUJsb2NrcyhmaW5hbENvZGVCbG9ja3MuY29uY2F0KGZpbmFsUHJlQmxvY2tzKSwgY2FsbGJhY2spO1xufVxuXG4vKipcbiAqIENhbGxiYWNrIHRvIGxldCB5b3UgZG8gc3R1ZmYgaW4geW91ciBhcHAgYWZ0ZXIgYSBwaWVjZSBvZiBjb2RlIGhhc1xuICogYmVlbiBoaWdobGlnaHRlZFxuICpcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrXG4gKiBAcmV0dXJuIHt2b2lkfVxuICovXG5mdW5jdGlvbiBvbkhpZ2hsaWdodChjYWxsYmFjaykge1xuICAgIG9uSGlnaGxpZ2h0Q2FsbGJhY2sgPSBjYWxsYmFjaztcbn1cblxuLyoqXG4gKiBFeHRlbmRzIHRoZSBsYW5ndWFnZSBwYXR0ZXJuIG1hdGNoZXNcbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbGFuZ3VhZ2UgICAgICAgICAgICBuYW1lIG9mIGxhbmd1YWdlXG4gKiBAcGFyYW0ge29iamVjdH0gbGFuZ3VhZ2VQYXR0ZXJucyAgICBvYmplY3Qgb2YgcGF0dGVybnMgdG8gYWRkIG9uXG4gKiBAcGFyYW0ge3N0cmluZ3x1bmRlZmluZWR9IGluaGVyaXRzICBvcHRpb25hbCBsYW5ndWFnZSB0aGF0IHRoaXMgbGFuZ3VhZ2VcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNob3VsZCBpbmhlcml0IHJ1bGVzIGZyb21cbiAqL1xuZnVuY3Rpb24gZXh0ZW5kKGxhbmd1YWdlLCBsYW5ndWFnZVBhdHRlcm5zLCBpbmhlcml0cykge1xuXG4gICAgLy8gSWYgd2UgZXh0ZW5kIGEgbGFuZ3VhZ2UgYWdhaW4gd2Ugc2hvdWxkbid0IG5lZWQgdG8gc3BlY2lmeSB0aGVcbiAgICAvLyBpbmhlcml0ZW5jZSBmb3IgaXQuIEZvciBleGFtcGxlLCBpZiB5b3UgYXJlIGFkZGluZyBzcGVjaWFsIGhpZ2hsaWdodGluZ1xuICAgIC8vIGZvciBhIGphdmFzY3JpcHQgZnVuY3Rpb24gdGhhdCBpcyBub3QgaW4gdGhlIGJhc2UgamF2YXNjcmlwdCBydWxlcywgeW91XG4gICAgLy8gc2hvdWxkIGJlIGFibGUgdG8gZG9cbiAgICAvL1xuICAgIC8vIFJhaW5ib3cuZXh0ZW5kKCdqYXZhc2NyaXB0JywgWyDigKYgXSk7XG4gICAgLy9cbiAgICAvLyBXaXRob3V0IHNwZWNpZnlpbmcgYSBsYW5ndWFnZSBpdCBzaG91bGQgaW5oZXJpdCAoZ2VuZXJpYyBpbiB0aGlzIGNhc2UpXG4gICAgaWYgKCFpbmhlcml0ZW5jZU1hcFtsYW5ndWFnZV0pIHtcbiAgICAgICAgaW5oZXJpdGVuY2VNYXBbbGFuZ3VhZ2VdID0gaW5oZXJpdHM7XG4gICAgfVxuXG4gICAgcGF0dGVybnNbbGFuZ3VhZ2VdID0gbGFuZ3VhZ2VQYXR0ZXJucy5jb25jYXQocGF0dGVybnNbbGFuZ3VhZ2VdIHx8IFtdKTtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlKGxhbmd1YWdlKSB7XG4gICAgZGVsZXRlIGluaGVyaXRlbmNlTWFwW2xhbmd1YWdlXTtcbiAgICBkZWxldGUgcGF0dGVybnNbbGFuZ3VhZ2VdO1xufVxuXG4vKipcbiAqIFN0YXJ0cyB0aGUgbWFnaWMgcmFpbmJvd1xuICpcbiAqIEByZXR1cm4ge3ZvaWR9XG4gKi9cbmZ1bmN0aW9uIGNvbG9yKC4uLmFyZ3MpIHtcblxuICAgIC8vIElmIHlvdSB3YW50IHRvIHN0cmFpZ2h0IHVwIGhpZ2hsaWdodCBhIHN0cmluZyB5b3UgY2FuIHBhc3MgdGhlXG4gICAgLy8gc3RyaW5nIG9mIGNvZGUsIHRoZSBsYW5ndWFnZSwgYW5kIGEgY2FsbGJhY2sgZnVuY3Rpb24uXG4gICAgLy9cbiAgICAvLyBFeGFtcGxlOlxuICAgIC8vXG4gICAgLy8gUmFpbmJvdy5jb2xvcihjb2RlLCBsYW5ndWFnZSwgZnVuY3Rpb24oaGlnaGxpZ2h0ZWRDb2RlLCBsYW5ndWFnZSkge1xuICAgIC8vICAgICAvLyB0aGlzIGNvZGUgYmxvY2sgaXMgbm93IGhpZ2hsaWdodGVkXG4gICAgLy8gfSk7XG4gICAgaWYgKHR5cGVvZiBhcmdzWzBdID09PSAnc3RyaW5nJykge1xuICAgICAgICBjb25zdCB3b3JrZXJEYXRhID0gX2dldFdvcmtlckRhdGEoYXJnc1swXSwgYXJnc1sxXSk7XG4gICAgICAgIF9tZXNzYWdlV29ya2VyKHdvcmtlckRhdGEsIChmdW5jdGlvbihjYikge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgICAgICBpZiAoY2IpIHtcbiAgICAgICAgICAgICAgICAgICAgY2IoZGF0YS5yZXN1bHQsIGRhdGEubGFuZyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfShhcmdzWzJdKSkpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gSWYgeW91IHBhc3MgYSBjYWxsYmFjayBmdW5jdGlvbiB0aGVuIHdlIHJlcnVuIHRoZSBjb2xvciBmdW5jdGlvblxuICAgIC8vIG9uIGFsbCB0aGUgY29kZSBhbmQgY2FsbCB0aGUgY2FsbGJhY2sgZnVuY3Rpb24gb24gY29tcGxldGUuXG4gICAgLy9cbiAgICAvLyBFeGFtcGxlOlxuICAgIC8vXG4gICAgLy8gUmFpbmJvdy5jb2xvcihmdW5jdGlvbigpIHtcbiAgICAvLyAgICAgY29uc29sZS5sb2coJ0FsbCBtYXRjaGluZyB0YWdzIG9uIHRoZSBwYWdlIGFyZSBub3cgaGlnaGxpZ2h0ZWQnKTtcbiAgICAvLyB9KTtcbiAgICBpZiAodHlwZW9mIGFyZ3NbMF0gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgX2hpZ2hsaWdodCgwLCBhcmdzWzBdKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIE90aGVyd2lzZSB3ZSB1c2Ugd2hhdGV2ZXIgbm9kZSB5b3UgcGFzc2VkIGluIHdpdGggYW4gb3B0aW9uYWxcbiAgICAvLyBjYWxsYmFjayBmdW5jdGlvbiBhcyB0aGUgc2Vjb25kIHBhcmFtZXRlci5cbiAgICAvL1xuICAgIC8vIEV4YW1wbGU6XG4gICAgLy9cbiAgICAvLyB2YXIgcHJlRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ByZScpO1xuICAgIC8vIHZhciBjb2RlRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NvZGUnKTtcbiAgICAvLyBjb2RlRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2RhdGEtbGFuZ3VhZ2UnLCAnamF2YXNjcmlwdCcpO1xuICAgIC8vIGNvZGVFbGVtZW50LmlubmVySFRNTCA9ICcvLyBIZXJlIGlzIHNvbWUgSmF2YVNjcmlwdCc7XG4gICAgLy8gcHJlRWxlbWVudC5hcHBlbmRDaGlsZChjb2RlRWxlbWVudCk7XG4gICAgLy8gUmFpbmJvdy5jb2xvcihwcmVFbGVtZW50LCBmdW5jdGlvbigpIHtcbiAgICAvLyAgICAgLy8gTmV3IGVsZW1lbnQgaXMgbm93IGhpZ2hsaWdodGVkXG4gICAgLy8gfSk7XG4gICAgLy9cbiAgICAvLyBJZiB5b3UgZG9uJ3QgcGFzcyBhbiBlbGVtZW50IGl0IHdpbGwgZGVmYXVsdCB0byBgZG9jdW1lbnRgXG4gICAgX2hpZ2hsaWdodChhcmdzWzBdLCBhcmdzWzFdKTtcbn1cblxuLyoqXG4gKiBNZXRob2QgdG8gYWRkIGFuIGFsaWFzIGZvciBhbiBleGlzdGluZyBsYW5ndWFnZS5cbiAqXG4gKiBGb3IgZXhhbXBsZSBpZiB5b3Ugd2FudCB0byBoYXZlIFwiY29mZmVlXCIgbWFwIHRvIFwiY29mZmVlc2NyaXB0XCJcbiAqXG4gKiBAc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9jY2FtcGJlbGwvcmFpbmJvdy9pc3N1ZXMvMTU0XG4gKiBAcGFyYW0ge3N0cmluZ30gYWxpYXNcbiAqIEBwYXJhbSB7c3RyaW5nfSBvcmlnaW5hbExhbmd1YWdlXG4gKiBAcmV0dXJuIHt2b2lkfVxuICovXG5mdW5jdGlvbiBhZGRBbGlhcyhhbGlhcywgb3JpZ2luYWxMYW5ndWFnZSkge1xuICAgIGFsaWFzZXNbYWxpYXNdID0gb3JpZ2luYWxMYW5ndWFnZTtcbn1cblxuLyoqXG4gKiBwdWJsaWMgbWV0aG9kc1xuICovXG5SYWluYm93ID0ge1xuICAgIGV4dGVuZCxcbiAgICByZW1vdmUsXG4gICAgb25IaWdobGlnaHQsXG4gICAgYWRkQWxpYXMsXG4gICAgY29sb3Jcbn07XG5cbmlmIChpc05vZGUpIHtcbiAgICBSYWluYm93LmNvbG9yU3luYyA9IGZ1bmN0aW9uKGNvZGUsIGxhbmcpIHtcbiAgICAgICAgY29uc3Qgd29ya2VyRGF0YSA9IF9nZXRXb3JrZXJEYXRhKGNvZGUsIGxhbmcpO1xuICAgICAgICBjb25zdCBwcmlzbSA9IG5ldyBQcmlzbSh3b3JrZXJEYXRhLm9wdGlvbnMpO1xuICAgICAgICByZXR1cm4gcHJpc20ucmVmcmFjdCh3b3JrZXJEYXRhLmNvZGUsIHdvcmtlckRhdGEubGFuZyk7XG4gICAgfTtcbn1cblxuLy8gSW4gdGhlIGJyb3dzZXIgaG9vayBpdCB1cCB0byBjb2xvciBvbiBwYWdlIGxvYWRcbmlmICghaXNOb2RlICYmICFpc1dvcmtlcikge1xuICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ0RPTUNvbnRlbnRMb2FkZWQnLCAoZXZlbnQpID0+IHtcbiAgICAgICAgaWYgKCFSYWluYm93LmRlZmVyKSB7XG4gICAgICAgICAgICBSYWluYm93LmNvbG9yKGV2ZW50KTtcbiAgICAgICAgfVxuICAgIH0sIGZhbHNlKTtcbn1cblxuLy8gRnJvbSBhIG5vZGUgd29ya2VyLCBoYW5kbGUgdGhlIHBvc3RNZXNzYWdlIHJlcXVlc3RzIHRvIGl0XG5pZiAoaXNXb3JrZXIpIHtcbiAgICBzZWxmLm9ubWVzc2FnZSA9IHJhaW5ib3dXb3JrZXI7XG59XG5cbmV4cG9ydCBkZWZhdWx0IFJhaW5ib3c7XG4iXSwibmFtZXMiOlsiaXNOb2RlIiwiaXNXb3JrZXIiLCJsZXQiLCJjb25zdCIsInV0aWxJc05vZGUiLCJ1dGlsSXNXb3JrZXIiXSwibWFwcGluZ3MiOiI7Ozs7OztFQUNPLFNBQVNBLFFBQU0sR0FBRztJQUN2QixPQUFPLE9BQU8sT0FBTyxLQUFLLFdBQVcsSUFBSSxPQUFPLENBQUMsUUFBUSxJQUFJLElBQUksSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxJQUFJLENBQUM7R0FDcEc7O0FBRUQsQUFBTyxFQUFBLFNBQVNDLFVBQVEsR0FBRztNQUN2QixPQUFPLE9BQU8sUUFBUSxLQUFLLFdBQVcsSUFBSSxPQUFPLElBQUksS0FBSyxXQUFXLENBQUM7R0FDekU7Ozs7Ozs7O0FBUUQsQUFBTyxFQUFBLFNBQVMsbUJBQW1CLENBQUMsS0FBSyxFQUFFOzs7Ozs7O01BT3ZDQyxJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEtBQUssQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLGVBQWUsQ0FBQyxDQUFDOzs7Ozs7TUFNckcsSUFBSSxDQUFDLFFBQVEsRUFBRTtVQUNYQyxJQUFNLE9BQU8sR0FBRyx1QkFBdUIsQ0FBQztVQUN4Q0EsSUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksS0FBSyxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsS0FB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