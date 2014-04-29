/**
 * Ink Core.
 * @module Ink_1
 * This module provides the necessary methods to create and load the modules using Ink.
 */

;(function(window, document) {

    'use strict';

    // skip redefinition of Ink core
    if ('Ink' in window) { return; }


    // internal data

    /*
     * NOTE:
     * invoke Ink.setPath('Ink', '/Ink/'); before requiring local modules
     */
    var paths = {};
    var modules = {};
    var modulesLoadOrder = [];
    var modulesRequested = {};
    var pendingRMs = [];
    var modulesWaitingForDeps = {};

    var apply = Function.prototype.apply;

    // auxiliary fns
    var isEmptyObject = function(o) {
        /*jshint unused:false */
        if (typeof o !== 'object') { return false; }
        for (var k in o) {
            if (o.hasOwnProperty(k)) {
                return false;
            }
        }
        return true;
    };

    /**
     * @namespace Ink_1
     */

    window.Ink = {
        _checkPendingRequireModules: function() {
            var I, F, o, dep, mod, cb, pRMs = [];
            for (I = 0, F = pendingRMs.length; I < F; ++I) {
                o = pendingRMs[I];

                if (!o) { continue; }

                for (dep in o.left) {
                    if (o.left.hasOwnProperty(dep)) {
                        mod = modules[dep];
                        if (mod) {
                            o.args[o.left[dep] ] = mod;
                            delete o.left[dep];
                            --o.remaining;
                        }
                    }
                }

                if (o.remaining > 0) {
                    pRMs.push(o);
                }
                else {
                    cb = o.cb;
                    if (!cb) { continue; }
                    delete o.cb; // to make sure I won't call this more than once!
                    cb.apply(false, o.args);
                }
            }

            pendingRMs = pRMs;

            if (pendingRMs.length > 0) {
                setTimeout( function() { Ink._checkPendingRequireModules(); }, 0 );
            }
        },

        /**
         * Get the full path of a module.
         * This method looks up the paths given in setPath (and ultimately the default Ink's path).
         *
         * @method getPath
         * @param {String}  key      Name of the module you want to get the path
         * @param {Boolean} [noLib] Flag to skip appending 'lib.js' to the returned path.
         */
        getPath: function(key, noLib) {
            var split = key.split(/[._]/g);
            var curKey;
            var i;
            var root;
            var path;
            // Look for Ink.Dom.Element.1, Ink.Dom.Element, Ink.Dom, Ink in this order.
            for (i = split.length; i >= 0; i -= 1) {
                curKey = split.slice(0, i + 1).join('.');  // See comment in setPath
                if (paths[curKey]) {
                    root = curKey;
                    break;
                }
            }
            path = paths[root || 'Ink'];
            if (!/\/$/.test(path)) {
                path += '/';
            }
            if (i < split.length) {
                path += split.slice(i + 1).join('/') + '/';
            }
            if (!noLib) {
                path += 'lib.js';
            }
            return path;
        },
        
        /**
         * Sets the URL path for a namespace.
         * Use this to customize where requireModules and createModule will load dependencies from.
         * This can be useful to set your own CDN for dynamic module loading or simply to change your module folder structure
         * 
         * @method setPath
         *
         * @param {String} key       Module or namespace
         * @param {String} rootURI   Base URL path and schema to be appended to the module or namespace
         *
         * @example
         *      Ink.setPath('Ink', 'http://my-cdn/Ink/');
         *      Ink.setPath('Lol', 'http://my-cdn/Lol/');
         *
         *      // Loads from http://my-cdn/Ink/Dom/Whatever/lib.js
         *      Ink.requireModules(['Ink.Dom.Whatever'], function () { ... });
         *      // Loads from http://my-cdn/Lol/Whatever/lib.js
         *      Ink.requireModules(['Lol.Whatever'], function () { ... });
         */
        setPath: function(key, rootURI) {
            // Replacing version separator with dot because the difference
            // between a submodule and a version doesn't matter here.
            // It would also overcomplicate the implementation of getPath
            paths[key.replace(/_/, '.')] = rootURI;
        },

        /**
         * Loads a script URL.
         * This creates a `script` tag in the `head` of the document.
         * Reports errors by listening to 'error' and 'readystatechange' events.
         *
         * @method loadScript
         * @param {String}  uri  Can be an external URL or a module name
         * @param {String}  [contentType]='text/javascript' The `type` attribute of the new script tag.
         */
        loadScript: function(uri, contentType) {
            /*jshint evil:true */

            if (uri.indexOf('/') === -1) {
                uri = this.getPath(uri);
            }

            var scriptEl = document.createElement('script');
            scriptEl.setAttribute('type', contentType || 'text/javascript');
            scriptEl.setAttribute('src', uri);

            scriptEl.onerror = scriptEl.onreadystatechange = function (err) {
                err = err || window.event;
                if (err.type === 'readystatechange' && scriptEl.readyState !== 'loaded') {
                    // if not readyState == 'loaded' it's not an error.
                    return;
                }
                Ink.error(['Failed to load script ', uri, '. (', err || 'unspecified error', ')'].join(''));
            };
            // CHECK ON ALL BROWSERS
            /*if (document.readyState !== 'complete' && !document.body) {
                document.write( scriptEl.outerHTML );
            }
            else {*/
                var aHead = document.getElementsByTagName('head');
                if(aHead.length > 0) {
                    aHead[0].appendChild(scriptEl);
                }
            //}
        },

        _loadLater: function (dep) {
            setTimeout(function () {
                if (modules[dep] || modulesRequested[dep] ||
                        modulesWaitingForDeps[dep]) {
                    return;
                }
                modulesRequested[dep] = true;
                Ink.loadScript(dep);
            }, 0);
        },

        /**
         * Defines a module namespace.
         *
         * @method namespace
         * @param  {String}   ns                    Namespace to define.
         * @param  {Boolean}  [returnParentAndKey]  Flag to change the return value to an array containing the namespace parent and the namespace key
         * @return {Object|Array} Returns the created namespace object
         */
        namespace: function(ns, returnParentAndKey) {
            if (!ns || !ns.length) { return null; }

            var levels = ns.split('.');
            var nsobj = window;
            var parent;

            for (var i = 0, f = levels.length; i < f; ++i) {
                nsobj[ levels[i] ] = nsobj[ levels[i] ] || {};
                parent = nsobj;
                nsobj = nsobj[ levels[i] ];
            }

            if (returnParentAndKey) {
                return [
                    parent,
                    levels[i-1]
                ];
            }

            return nsobj;
        },

        /**
         * Loads a module.
         * A synchronous method to get the module from the registry. It assumes the module is defined and loaded already!
         *
         * @method getModule
         * @param  {String}  mod        Module name
         * @param  {Number}  [version]  Version number of the module
         * @return {Object|Function}    Module object or function, depending how the module is defined
         */
        getModule: function(mod, version) {
            var key = version ? [mod, '_', version].join('') : mod;
            return modules[key];
        },

        /**
         * Creates a new module. 
         * Use this to wrap your code and benefit from the module loading used throughout the Ink library
         *
         * @method createModule
         * @uses   requireModules
         * @param  {String}    mod      Module name, separated by dots. Like Ink.Dom.Selector, Ink.UI.Modal
         * @param  {Number}    version  Version number
         * @param  {Array}     deps     Array of module names which are dependencies of the module being created. The order in which they are passed here will define the order they will be passed to the callback function.
         * @param  {Function}  modFn    The callback function to be executed when all the dependencies are resolved. The dependencies are passed as arguments, in the same order they were declared. The function itself should return the module.
         * @sample Ink_1_createModule.html 
         *
         */
        createModule: function(mod, ver, deps, modFn) { // define
            if (typeof mod !== 'string') {
                throw new Error('module name must be a string!');
            }

            // validate version correctness
            if (!(typeof ver === 'number' || (typeof ver === 'string' && ver.length > 0))) {
                throw new Error('version number missing!');
            }

            var modAll = [mod, '_', ver].join('');

            modulesWaitingForDeps[modAll] = true;

            var cb = function() {
                //console.log(['createModule(', mod, ', ', ver, ', [', deps.join(', '), '], ', !!modFn, ')'].join(''));

                // make sure module in not loaded twice
                if (modules[modAll]) {
                    //console.warn(['Ink.createModule ', modAll, ': module has been defined already.'].join(''));
                    return;
                }


                // delete related pending tasks
                delete modulesRequested[modAll];
                delete modulesRequested[mod];


                // run module's supplied factory
                var args = Array.prototype.slice.call(arguments);
                var moduleContent = modFn.apply(window, args);
                modulesLoadOrder.push(modAll);
                // console.log('** loaded module ' + modAll + '**');


                // set version
                if (typeof moduleContent === 'object') { // Dom.Css Dom.Event
                    moduleContent._version = ver;
                }
                else if (typeof moduleContent === 'function') {
                    moduleContent.prototype._version = ver; // if constructor
                    moduleContent._version = ver;           // if regular function
                }


                // add to global namespace...
                var isInkModule = mod.indexOf('Ink.') === 0;
                var t;
                if (isInkModule) {
                    t = Ink.namespace(mod, true); // for mod 'Ink.Dom.Css', t[0] gets 'Ink.Dom' object and t[1] 'Css'
                }


                // versioned
                modules[ modAll ] = moduleContent; // in modules
                delete modulesWaitingForDeps[ modAll ];

                if (isInkModule) {
                    t[0][ t[1] + '_' + ver ] = moduleContent; // in namespace
                }


                // unversioned
                modules[ mod ] = moduleContent; // in modules

                if (isInkModule) {
                    if (isEmptyObject( t[0][ t[1] ] )) {
                        t[0][ t[1] ] = moduleContent; // in namespace
                    }
                    // else {
                        // console.warn(['Ink.createModule ', modAll, ': module has been defined already with a different version!'].join(''));
                    // }
                }


                if (this) { // there may be pending requires expecting this module, check...
                    Ink._checkPendingRequireModules();
                }
            };

            this.requireModules(deps, cb);
        },

        /**
         * Requires modules asynchronously 
         * Use this to get modules, even if they're not loaded yet
         *
         * @method requireModules
         * @param  {Array}     deps  Array of module names. The order in which they are passed here will define the order they will be passed to the callback function. 
         * @param  {Function}  cbFn  The callback function to be executed when all the dependencies are resolved. The dependencies are passed as arguments, in the same order they were declared.
         * @sample Ink_1_requireModules.html 
         */
        requireModules: function(deps, cbFn) { // require
            //console.log(['requireModules([', deps.join(', '), '], ', !!cbFn, ')'].join(''));
            var i, f, o, dep, mod;
            f = deps.length;
            o = {
                args: new Array(f),
                left: {},
                remaining: f,
                cb: cbFn
            };

            if (!(typeof deps === 'object' && deps.length !== undefined)) {
                throw new Error('Dependency list should be an array!');
            }
            if (typeof cbFn !== 'function') {
                throw new Error('Callback should be a function!');
            }

            for (i = 0; i < f; ++i) {
                if (Ink._moduleRenames[deps[i]]) {
                    Ink.warn(deps[i] + ' was renamed to ' + Ink._moduleRenames[deps[i]]);
                    dep = Ink._moduleRenames[deps[i]];
                } else {
                    dep = deps[i];
                }
                mod = modules[dep];
                if (mod) {
                    o.args[i] = mod;
                    --o.remaining;
                    continue;
                }
                else if (!modulesRequested[dep]) {
                    Ink._loadLater(dep);
                }
                o.left[dep] = i;
            }

            if (o.remaining > 0) {
                pendingRMs.push(o);
            }
            else {
                cbFn.apply(true, o.args);
            }
        },

        _moduleRenames: {
            'Ink.UI.Aux_1': 'Ink.UI.Common_1'
        },

        /**
         * Lists loaded module names.
         * The list is ordered by loaded time (oldest module comes first)
         *
         * @method getModulesLoadOrder
         * @return {Array} returns the order in which modules were resolved and correctly loaded
         */
        getModulesLoadOrder: function() {
            return modulesLoadOrder.slice();
        },

        /**
         * Builds the markup needed to load the modules.
         * This method builds the script tags needed to load the currently used modules
         * 
         * @method getModuleScripts
         * @uses getModulesLoadOrder
         * @return {String} The script markup
         */
        getModuleScripts: function() {
            var mlo = this.getModulesLoadOrder();
            mlo.unshift('Ink_1');
            mlo = mlo.map(function(m) {
                return ['<scr', 'ipt type="text/javascript" src="', Ink.getModuleURL(m), '"></scr', 'ipt>'].join('');
            });

            return mlo.join('\n');
        },
        
        /**
         * Creates an Ink.Ext module
         *
         * Does exactly the same as createModule but creates the module in the Ink.Ext namespace
         *
         * @method createExt
         * @uses createModule
         * @param {String} moduleName   Extension name
         * @param {String} version  Extension version
         * @param {Array}  dependencies Extension dependencies
         * @param {Function} modFn  Function returning the extension
         * @sample Ink_1_createExt.html 
         */
        createExt: function (moduleName, version, dependencies, modFn) {
            return Ink.createModule('Ink.Ext.' + moduleName, version, dependencies, modFn);
        },

        /**
         * Function.prototype.bind alternative.
         * Creates a new function that, when called, has its this keyword set to the provided value, with a given sequence of arguments preceding any provided when the new function is called.
         *
         * @method bind
         * @param {Function}  fn        The function 
         * @param {Object}    context   The value to be passed as the this parameter to the target function when the bound function is called. If used as false, it preserves the original context and just binds the arguments.
         * @param {Any}   [args*]     Additional arguments will be sent to the original function as prefix arguments.
         * @return {Function}
         * @sample Ink_1_bind.html 
         */
        bind: function(fn, context) {
            var args = Array.prototype.slice.call(arguments, 2);
            return function() {
                var innerArgs = Array.prototype.slice.call(arguments);
                var finalArgs = args.concat(innerArgs);
                return fn.apply(context === false ? this : context, finalArgs);
            };
        },

        /**
         * Function.prototype.bind alternative for class methods
         * Creates a new function that, when called, has this k
         * @method bindMethod
         * @uses bind
         * @param {Object}  object      The object that contains the method to bind
         * @param {String}  methodName  The name of the method that will be bound
         * @param {Any}   [args*]     Additional arguments will be sent to the new method as prefix arguments.
         * @return {Function}
         * @sample Ink_1_bindMethod.html 
         */
        bindMethod: function (object, methodName) {
            return Ink.bind.apply(Ink,
                [object[methodName], object].concat([].slice.call(arguments, 2)));
        },

        /**
         * Function.prototype.bind alternative for event handlers.
         * Same as bind but keeps first argument of the call the original event.
         * Set "context" to `false` to preserve the original context of the function and just bind the arguments.
         *
         * @method bindEvent
         * @param {Function}  fn        The function 
         * @param {Object}    context   The value to be passed as the this parameter to the target 
         * @param {Any}     [args*]   Additional arguments will be sent to the original function as prefix arguments
         * @return {Function}
         * @sample Ink_1_bindEvent.html 
         */
        bindEvent: function(fn, context) {
            var args = Array.prototype.slice.call(arguments, 2);
            return function(event) {
                var finalArgs = args.slice();
                finalArgs.unshift(event || window.event);
                return fn.apply(context === false ? this : context, finalArgs);
            };
        },

        /**
         * Alias to document.getElementById
         *
         * @method i
         * @param {String} id Element ID
         * @return {DOMElement}
         * @sample Ink_1_i.html 
         */
        i: function(id) {
            if(!id) {
                throw new Error('Ink.i => id or element must be passed');
            }
            if(typeof(id) === 'string') {
                return document.getElementById(id);
            }
            return id;
        },

        /**
         * Alias for Ink.Dom.Selector
         *
         * @method ss
         * @uses Ink.Dom.Selector.select
         * @param {String}     rule
         * @param {DOMElement} [from]
         * @return {Array} array of DOMElements
         * @sample Ink_1_ss.html 
         */
        ss: function(rule, from)
        {
            if(typeof(Ink.Dom) === 'undefined' || typeof(Ink.Dom.Selector) === 'undefined') {
                throw new Error('This method requires Ink.Dom.Selector');
            }
            return Ink.Dom.Selector.select(rule, (from || document));
        },

        /**
         * Alias for Ink.Dom.Selector first result
         *
         * @method s
         * @uses Ink.Dom.Selector.select
         * @param {String}     rule     Selector string
         * @param {DOMElement} [from]   Context element. If set to a DOM element, the rule will only look for descendants of this DOM Element.
         * @return {DOMElement}
         * @sample Ink_1_s.html 
         */
        s: function(rule, from)
        {
            if(typeof(Ink.Dom) === 'undefined' || typeof(Ink.Dom.Selector) === 'undefined') {
                throw new Error('This method requires Ink.Dom.Selector');
            }
            return Ink.Dom.Selector.select(rule, (from || document))[0] || null;
        },

        /**
         * Extends an object with another
         * Copy all of the properties in one or more source objects over to the destination object, and return the destination object. It's in-order, so the last source will override properties of the same name in previous arguments.
         *
         * @method extendObj
         * @param {Object} destination  The object that will receive the new/updated properties
         * @param {Object} source       The object whose properties will be copied over to the destination object
         * @param {Object} [args*]      Additional source objects. The last source will override properties of the same name in the previous defined sources
         * @return destination object, enriched with defaults from the sources
         * @sample Ink_1_extendObj.html 
         */
        extendObj: function(destination, source) {
            if (arguments.length > 2) {
                source = Ink.extendObj.apply(this, [].slice.call(arguments, 1));
            }
            if (source) {
                for (var property in source) {
                    if(Object.prototype.hasOwnProperty.call(source, property)) {
                        destination[property] = source[property];
                    }
                }
            }
            return destination;
        },

        /**
         * Calls native console.log if available.
         *
         * @method log
         * @param {Any} [args*] Arguments to be evaluated
         * @sample Ink_1_log.html 
         **/
        log: function () {
            // IE does not have console.log.apply in IE10 emulated mode
            var console = window.console;
            if (console && console.log) {
                apply.call(console.log, console, arguments);
            }
        },

        /**
         * Calls native console.warn if available.
         *
         * @method warn
         * @param {Any} [args*] Arguments to be evaluated
         * @sample Ink_1_warn.html 
         **/
        warn: function () {
            // IE does not have console.log.apply in IE10 emulated mode
            var console = window.console;
            if (console && console.warn) {
                apply.call(console.warn, console, arguments);
            }
        },

        /**
         * Calls native console.error if available.
         *
         * @method error
         * @param {Any} [args*] Arguments to be evaluated
         * @sample Ink_1_error.html 
         **/
        error: function () {
            // IE does not have console.log.apply in IE10 emulated mode
            var console = window.console;
            if (console && console.error) {
                apply.call(console.error, console, arguments);
            }
        }
    };

    Ink.setPath('Ink',
        ('INK_PATH' in window) ? window.INK_PATH : window.location.protocol + '//js.ink.sapo.pt/Ink/');



    // TODO for debug - to detect pending stuff
    /*
    var failCount = {};   // fail count per module name
    var maxFails = 3;     // times
    var checkDelta = 0.5; //seconds

    var tmpTmr = setInterval(function() {
        var mk = Object.keys(modulesRequested);
        var l = mk.length;

        if (l > 0) {
            // console.log('** waiting for modules: ' + mk.join(', ') + ' **');

            for (var i = 0, f = mk.length, k, v; i < f; ++i) {
                k = mk[i];
                v = failCount[k];
                failCount[k] = (v === undefined) ? 1 : ++v;

                if (v >= maxFails) {
                    console.error('** Loading of module ' + k + ' failed! **');
                    delete modulesRequested[k];
                }
            }
        }
        else {
            // console.log('** Module loads complete. **');
            clearInterval(tmpTmr);
        }
    }, checkDelta*1000);
    */
}(window, document));

/**
 * Cross Browser Ajax requests
 * @module Ink.Net.Ajax_1
 * @version 1
 */

Ink.createModule('Ink.Net.Ajax', '1', [], function() {

    'use strict';

    /**
     * Creates a new XMLHttpRequest object
     *
     * @class Ink.Net.Ajax
     * @constructor
     *
     * @param {String}          url                             Request URL
     * @param {Object}          options                         Request options
     * @param {Boolean}         [options.asynchronous]=true     If false, the request synchronous.
     * @param {Boolean}         [options.cors]                  Flag to activate CORS. Set this to true if you're doing a cross-origin request
     * @param {String}          [options.method]='POST'         HTTP request method. POST by default.
     * @param {Object|String}   [options.parameters]            Request parameters to be sent with the request
     * @param {Number}          [options.timeout]               Request timeout in seconds
     * @param {Number}          [options.delay]                 Artificial delay. If the request is completed faster than this delay, wait the remaining time before executing the callbacks
     * @param {String}          [options.postBody]              POST request body. If not specified, it's filled with the contents from parameters
     * @param {String}          [options.contentType]           Content-type header to be sent. Defaults to 'application/x-www-form-urlencoded'
     * @param {Object}          [options.requestHeaders]        Key-value pairs for additional request headers
     * @param {Function}        [options.onComplete]            Callback executed after the request is completed, regardless of what happened during the request.
     * @param {Function}        [options.onSuccess]             Callback executed if the request is successful (requests with 2xx status codes)
     * @param {Function}        [options.onFailure]             Callback executed if the request fails (requests with status codes different from 2xx)
     * @param {Function}        [options.onException]           Callback executed if an exception occurs. Receives the exception as a parameter.
     * @param {Function}        [options.onCreate]              Callback executed after object initialization but before the request is made
     * @param {Function}        [options.onInit]                Callback executed before any initialization
     * @param {Function}        [options.onTimeout]             Callback executed if the request times out
     * @param {Boolean|String}  [options.evalJS]=true           If the request Content-type header is application/json, evaluates the response and populates responseJSON. Use 'force' if you want to force the response evaluation, no matter what Content-type it's using.
     * @param {Boolean}         [options.sanitizeJSON]          Flag to sanitize the content of responseText before evaluation
     * @param {String}          [options.xhrProxy]              URI for proxy service hosted on the same server as the web app, that can fetch documents from other domains. The service must pipe all input and output untouched (some input sanitization is allowed, like clearing cookies). e.g., requesting http://example.org/doc can become /proxy/http%3A%2F%2Fexample.org%2Fdoc The proxy service will be used for cross-domain requests, if set, else a network error is returned as exception.
     *
     * @sample Ink_Net_Ajax_1.html 
     */
    var Ajax = function(url, options){

        // start of AjaxMock patch - uncomment to enable it
        /*var AM = SAPO.Communication.AjaxMock;
        if (AM && !options.inMock) {
            if (AM.autoRecordThisUrl && AM.autoRecordThisUrl(url)) {
                return new AM.Record(url, options);
            }
            if (AM.mockThisUrl && AM.mockThisUrl(url)) {
                return new AM.Play(url, options, true);
            }
        }*/
        // end of AjaxMock patch

        this.init(url, options);
    };

    /**
    * Options for all requests. These can then be overriden for individual ones.
    */
    Ajax.globalOptions = {
        parameters: {},
        requestHeaders: {}
    };


    // IE10 does not need XDomainRequest
    var xMLHttpRequestWithCredentials = 'XMLHttpRequest' in window && 'withCredentials' in (new XMLHttpRequest());



    Ajax.prototype = {

        init: function(url, userOptions) {
            if (!url) {
                throw new Error("WRONG_ARGUMENTS_ERR");
            }
            var options = Ink.extendObj({
                asynchronous: true,
                method: 'POST',
                parameters: null,
                timeout: 0,
                delay: 0,
                postBody: '',
                contentType:  'application/x-www-form-urlencoded',
                requestHeaders: null,
                onComplete: null,
                onSuccess: null,
                onFailure: null,
                onException: null,
                onHeaders: null,
                onCreate: null,
                onInit: null,
                onTimeout: null,
                sanitizeJSON: false,
                evalJS: true,
                xhrProxy: '',
                cors: false,
                debug: false,
                useCredentials: false,
                signRequest: false
            }, Ajax.globalOptions);

            if (userOptions && typeof userOptions === 'object') {
                options = Ink.extendObj(options, userOptions);


                if (typeof userOptions.parameters === 'object') {
                    options.parameters = Ink.extendObj(Ink.extendObj({}, Ajax.globalOptions.parameters), userOptions.parameters);
                } else if (userOptions.parameters !== null) {
                    var globalParameters = this.paramsObjToStr(Ajax.globalOptions.parameters);
                    if (globalParameters) {
                        options.parameters = userOptions.parameters + '&' + globalParameters;
                    }
                }

                options.requestHeaders = Ink.extendObj({}, Ajax.globalOptions.requestHeaders);
                options.requestHeaders = Ink.extendObj(options.requestHeaders, userOptions.requestHeaders);
            }

            this.options = options;

            this.safeCall('onInit');

            this.url = url;

            var urlLocation = this._locationFromURL(url);
            this.isHTTP = this._locationIsHTTP(urlLocation);
            this.isCrossDomain = this._locationIsCrossDomain(urlLocation, location);

            this.requestHasBody = options.method.search(/^get|head$/i) < 0;

            if(this.options.cors) {
                this.isCrossDomain = false;
            }

            this.transport = this.getTransport();

            this.request();
        },

        /**
         * Returns a location object from an URL
         *
         * @method _locationFromUrl
         * @param url
         * @private
         **/
        _locationFromURL: function (url) {
            var urlLocation =  document.createElementNS ?
                document.createElementNS('http://www.w3.org/1999/xhtml', 'a') :
                document.createElement('a');
            urlLocation.href = url;
            return urlLocation;
        },

        /**
         * Checks whether a location is HTTP or HTTPS
         *
         * @method locationIsHttp
         * @param urlLocation
         * @private
         */
        _locationIsHTTP: function (urlLocation) {
            return urlLocation.protocol.match(/^https?:/i) ? true : false;
        },

        /**
         * Checks whether a location is cross-domain from another
         *
         * @method _locationIsCrossDomain
         * @param urlLocation {Location}
         * @param otherLocation {Location}
         */
        _locationIsCrossDomain: function (urlLocation, location) {
            location = location || window.location;
            if (!Ajax.prototype._locationIsHTTP(urlLocation) || location.protocol === 'widget:' || typeof window.widget === 'object') {
                return false;
            } else {
                return location.protocol           !== urlLocation.protocol ||
                       location.host.split(':')[0] !== urlLocation.host.split(':')[0];
            }
        },

        /**
         * Creates the appropriate XMLHttpRequest object
         *
         * @method getTransport
         * @return {Object} XMLHttpRequest object
         */
        getTransport: function()
        {
            /*global XDomainRequest:false, ActiveXObject:false */
            if (!xMLHttpRequestWithCredentials && this.options.cors && 'XDomainRequest' in window) {
                this.usingXDomainReq = true;
                return new XDomainRequest();
            }
            else if (typeof XMLHttpRequest !== 'undefined') {
                return new XMLHttpRequest();
            }
            else if (typeof ActiveXObject !== 'undefined') {
                try {
                    return new ActiveXObject('Msxml2.XMLHTTP');
                } catch (e) {
                    return new ActiveXObject('Microsoft.XMLHTTP');
                }
            } else {
                return null;
            }
        },

        /**
         * Set the necessary headers for an ajax request
         *
         * @method setHeaders
         * @param {String} url The url for the request
         */
        setHeaders: function()
        {
            if (this.transport) {
                try {
                    var headers = {
                        "Accept": "text/javascript,text/xml,application/xml,application/xhtml+xml,text/html,application/json;q=0.9,text/plain;q=0.8,video/x-mng,image/png,image/jpeg,image/gif;q=0.2,*/*;q=0.1",
                        "Accept-Language": navigator.language,
                        "X-Requested-With": "XMLHttpRequest",
                        "X-Ink-Version": "2"
                    };
                    if (this.options.cors) {
                        if (!this.options.signRequest) {
                            delete headers['X-Requested-With'];
                        }
                        delete headers['X-Ink-Version'];
                    }

                    if (this.options.requestHeaders && typeof this.options.requestHeaders === 'object') {
                        for(var headerReqName in this.options.requestHeaders) {
                            if (this.options.requestHeaders.hasOwnProperty(headerReqName)) {
                                headers[headerReqName] = this.options.requestHeaders[headerReqName];
                            }
                        }
                    }

                    if (this.transport.overrideMimeType && (navigator.userAgent.match(/Gecko\/(\d{4})/) || [0,2005])[1] < 2005) {
                        headers.Connection = 'close';
                    }

                    for (var headerName in headers) {
                        if(headers.hasOwnProperty(headerName)) {
                            this.transport.setRequestHeader(headerName, headers[headerName]);
                        }
                    }
                } catch(e) {}
            }
        },

        /**
         * Converts an object with parameters to a querystring
         *
         * @method paramsObjToStr
         * @param {Object|String}  optParams  parameters object
         * @return {String} querystring
         */
        paramsObjToStr: function(optParams) {
            var k, m, p, a, params = [];
            if (typeof optParams === 'object') {
                for (p in optParams){
                    if (optParams.hasOwnProperty(p)) {
                        a = optParams[p];
                        if (Object.prototype.toString.call(a) === '[object Array]' && !isNaN(a.length)) {
                            for (k = 0, m = a.length; k < m; k++) {
                                params = params.concat([
                                    encodeURIComponent(p), '[]',   '=',
                                    encodeURIComponent(a[k]), '&'
                                ]);
                            }
                        }
                        else {
                            params = params.concat([
                                encodeURIComponent(p), '=',
                                encodeURIComponent(a), '&'
                            ]);
                        }
                    }
                }
                if (params.length > 0) {
                    params.pop();
                }
            }
            else
            {
                return optParams;
            }
            return params.join('');
        },

        /**
         * Set the url parameters for a GET request
         *
         * @method setParams
         */
        setParams: function()
        {
            var params = null, optParams = this.options.parameters;

            if(typeof optParams === "object"){
                params = this.paramsObjToStr(optParams);
            } else {
                params = '' + optParams;
            }

            if(params){
                if(this.url.indexOf('?') > -1) {
                    this.url = this.url.split('#')[0] + '&' + params;
                } else {
                    this.url = this.url.split('#')[0] + '?' + params;
                }
            }
        },

        /**
         * Gets an HTTP header from the response
         *
         * @method getHeader
         * @param {String}  name    Header name
         * @return {String} header  Content
         */
        getHeader: function(name)
        {
            if (this.usingXDomainReq && name === 'Content-Type') {
                return this.transport.contentType;
            }
            try{
                return this.transport.getResponseHeader(name);
            } catch(e) {
                return null;
            }
        },

        /**
         * Gets all the HTTP headers from the response
         *
         * @method getAllHeaders
         * @return {String} The headers, each separated by a newline
         */
        getAllHeaders: function()
        {
            try {
                return this.transport.getAllResponseHeaders();
            } catch(e) {
                return null;
            }
        },

        /**
         * Sets the response object
         *
         * @method getResponse
         * @return {Object} the response object
         */
        getResponse: function(){
            // setup our own stuff
            var t = this.transport,
                r = {
                    headerJSON: null,
                    responseJSON: null,
                    getHeader: this.getHeader,
                    getAllHeaders: this.getAllHeaders,
                    request: this,
                    transport: t,
                    timeTaken: new Date() - this.startTime,
                    requestedUrl: this.url
                };

            // setup things expected from the native object
            r.readyState = t.readyState;
            try { r.responseText = t.responseText; } catch(e) {}
            try { r.responseXML  = t.responseXML;  } catch(e) {}
            try { r.status       = t.status;       } catch(e) { r.status     = 0;  }
            try { r.statusText   = t.statusText;   } catch(e) { r.statusText = ''; }

            return r;
        },

        /**
         * Aborts the request if still running. No callbacks are called
         *
         * @method abort
         */
        abort: function(){
            if (this.transport) {
                clearTimeout(this.delayTimeout);
                clearTimeout(this.stoTimeout);
                try { this.transport.abort(); } catch(ex) {}
                this.finish();
            }
        },

        /**
         * Executes the state changing phase of an ajax request
         *
         * @method runStateChange
         */
        runStateChange: function()
        {
            var rs = this.transport.readyState;
            if (rs === 3) {
                if (this.isHTTP) {
                    this.safeCall('onHeaders');
                }
            } else if (rs === 4 || this.usingXDomainReq) {

                if (this.options.asynchronous && this.options.delay && (this.startTime + this.options.delay > new Date().getTime())) {
                    this.delayTimeout = setTimeout(Ink.bind(this.runStateChange, this), this.options.delay + this.startTime - new Date().getTime());
                    return;
                }

                var responseJSON,
                    responseContent = this.transport.responseText,
                    response = this.getResponse(),
                    curStatus = this.transport.status;

                if (this.isHTTP && !this.options.asynchronous) {
                    this.safeCall('onHeaders');
                }

                clearTimeout(this.stoTimeout);

                if (curStatus === 0) {
                    // Status 0 indicates network error for http requests.
                    // For http less requests, 0 is always returned.
                    if (this.isHTTP) {
                        this.safeCall('onException', this.makeError(18, 'NETWORK_ERR'));
                    } else {
                        curStatus = responseContent ? 200 : 404;
                    }
                }
                else if (curStatus === 304) {
                    curStatus = 200;
                }
                var isSuccess = this.usingXDomainReq || 200 <= curStatus && curStatus < 300;

                var headerContentType = this.getHeader('Content-Type') || '';
                if (this.options.evalJS &&
                    (headerContentType.indexOf("application/json") >= 0 || this.options.evalJS === 'force')){
                        try {
                            responseJSON = this.evalJSON(responseContent, this.sanitizeJSON);
                            if(responseJSON){
                                responseContent = response.responseJSON = responseJSON;
                            }
                        } catch(e){
                            if (isSuccess) {
                                // If the request failed, then this is perhaps an error page
                                // so don't notify error.
                                this.safeCall('onException', e);
                            }
                        }
                }

                if (this.usingXDomainReq && headerContentType.indexOf('xml') !== -1 && 'DOMParser' in window) {
                    // http://msdn.microsoft.com/en-us/library/ie/ff975278(v=vs.85).aspx
                    var mimeType;
                    switch (headerContentType) {
                        case 'application/xml':
                        case 'application/xhtml+xml':
                        case 'image/svg+xml':
                            mimeType = headerContentType;
                            break;
                        default:
                            mimeType = 'text/xml';
                    }
                    var xmlDoc = (new DOMParser()).parseFromString( this.transport.responseText, mimeType);
                    this.transport.responseXML = xmlDoc;
                    response.responseXML  = xmlDoc;
                }

                if (this.transport.responseXML !== null && response.responseJSON === null && this.transport.responseXML.xml !== ""){
                    responseContent = this.transport.responseXML;
                }

                if (curStatus || this.usingXDomainReq) {
                    if (isSuccess) {
                        this.safeCall('onSuccess', response, responseContent);
                    } else {
                        this.safeCall('onFailure', response, responseContent);
                    }
                    this.safeCall('on'+curStatus, response, responseContent);
                }
                this.finish(response, responseContent);
            }
        },

        /**
         * Last step after XHR is complete. Call onComplete and cleanup object
         *
         * @method finish
         * @param {Any} response
         * @param {Any} responseContent
         */
        finish: function(response, responseContent){
            if (response) {
                this.safeCall('onComplete', response, responseContent);
            }
            clearTimeout(this.stoTimeout);

            if (this.transport) {
                // IE6 sometimes barfs on this one
                try{ this.transport.onreadystatechange = null; } catch(e){}

                if (typeof this.transport.destroy === 'function') {
                    // Stuff for Samsung.
                    this.transport.destroy();
                }

                // Let XHR be collected.
                this.transport = null;
            }
        },

        /**
         * Safely calls a callback function.
         * Verifies that the callback is well defined and traps errors
         *
         * @method safeCall
         * @param {Function}  listener
         */
        safeCall: function(listener, first/*, second*/) {
            function rethrow(exception){
                setTimeout(function() {
                    // Rethrow exception so it'll land in
                    // the error console, firebug, whatever.
                    if (exception.message) {
                        exception.message += '\n'+(exception.stacktrace || exception.stack || '');
                    }
                    throw exception;
                }, 1);
            }
            if (typeof this.options[listener] === 'function') {
                //SAPO.safeCall(this, this.options[listener], first, second);
                //return object[listener].apply(object, [].slice.call(arguments, 2));
                try {
                    this.options[listener].apply(this, [].slice.call(arguments, 1));
                } catch(ex) {
                    rethrow(ex);
                }
            } else if (first && window.Error && (first instanceof Error)) {
                rethrow(first);
            }
        },

        /**
         * Sets a new request header for the next http request
         *
         * @method setRequestHeader
         * @param {String} name
         * @param {String} value
         */
        setRequestHeader: function(name, value){
            if (!this.options.requestHeaders) {
                this.options.requestHeaders = {};
            }
            this.options.requestHeaders[name] = value;
        },

        /**
         * Executes the request
         *
         * @method request
         */
        request: function()
        {
            if(this.transport) {
                var params = null;
                if(this.requestHasBody) {
                    if(this.options.postBody !== null && this.options.postBody !== '') {
                        params = this.options.postBody;
                        this.setParams();
                    } else if (this.options.parameters !== null && this.options.parameters !== ''){
                        params = this.options.parameters;
                    }

                    if (typeof params === "object" && !params.nodeType) {
                        params = this.paramsObjToStr(params);
                    } else if (typeof params !== "object" && params !== null){
                        params = '' + params;
                    }

                    if(this.options.contentType) {
                        this.setRequestHeader('Content-Type', this.options.contentType);
                    }
                } else {
                    this.setParams();
                }

                var url = this.url;
                var method = this.options.method;
                var crossDomain = this.isCrossDomain;

                if (crossDomain && this.options.xhrProxy) {
                    this.setRequestHeader('X-Url', url);
                    url = this.options.xhrProxy + encodeURIComponent(url);
                    crossDomain = false;
                }

                try {
                    this.transport.open(method, url, this.options.asynchronous);
                } catch(e) {
                    this.safeCall('onException', e);
                    return this.finish(this.getResponse(), null);
                }

                this.setHeaders();

                this.safeCall('onCreate');

                if(this.options.timeout && !isNaN(this.options.timeout)) {
                    this.stoTimeout = setTimeout(Ink.bind(function() {
                        if(this.options.onTimeout) {
                            this.safeCall('onTimeout');
                            this.abort();
                        }
                    }, this), (this.options.timeout * 1000));
                }

                if(this.options.useCredentials && !this.usingXDomainReq) {
                    this.transport.withCredentials = true;
                }

                if(this.options.asynchronous && !this.usingXDomainReq) {
                    this.transport.onreadystatechange = Ink.bind(this.runStateChange, this);
                }
                else if (this.usingXDomainReq) {
                    this.transport.onload = Ink.bind(this.runStateChange, this);
                }

                try {
                    if (crossDomain) {
                        // Need explicit handling because Mozila aborts
                        // the script and Chrome fails silently.per the spec
                        throw this.makeError(18, 'NETWORK_ERR');
                    } else {
                        this.startTime = new Date().getTime();
                        this.transport.send(params);
                    }
                } catch(e) {
                    this.safeCall('onException', e);
                    return this.finish(this.getResponse(), null);
                }

                if(!this.options.asynchronous) {
                    this.runStateChange();
                }
            }
        },

        /**
         * Returns a new exception object that can be thrown
         *
         * @method makeError
         * @param code      Error Code
         * @param message   Message
         * @returns {Object}
         */
        makeError: function(code, message){
            if (typeof Error !== 'function') {
                return {code: code, message: message};
            }
            var e = new Error(message);
            e.code = code;
            return e;
        },

        /**
         * Checks if a given string is valid JSON
         *
         * @method isJSON
         * @param {String} str  String to be evaluated
         * @return {Boolean}    True if the string is valid JSON
         */
        isJSON: function(str)
        {
            if (typeof str !== "string" || !str){ return false; }
            str = str.replace(/\\./g, '@').replace(/"[^"\\\n\r]*"/g, '');
            return (/^[,:{}\[\]0-9.\-+Eaeflnr-u \n\r\t]*$/).test(str);
        },

        /**
         * Evaluates a given string as JSON
         *
         * @method evalJSON
         * @param {String}  str         String to be evaluated
         * @param {Boolean} sanitize    Flag to sanitize the content
         * @return {Object}             JSON content as an object
         */
        evalJSON: function(strJSON, sanitize)
        {
            if (strJSON && (!sanitize || this.isJSON(strJSON))) {
                try {
                    if (typeof JSON  !== "undefined" && typeof JSON.parse !== 'undefined'){
                        return JSON.parse(strJSON);
                    }
                    /*jshint evil:true */
                    return eval('(' + strJSON + ')');
                } catch(e) {
                    throw new Error('ERROR: Bad JSON string...');
                }
            }
            return null;
        }
    };

    /**
     * Loads content from a given url through an XMLHttpRequest.
     *
     * Shortcut function for simple AJAX use cases. Works with JSON, XML and plain text.
     *
     * @method load
     * @param {String}   url        Request URL
     * @param {Function} callback   Callback to be executed if the request is successful
     * @return {Object}             XMLHttpRequest object
     *
     * @sample Ink_Net_Ajax_load.html 
     */
    Ajax.load = function(url, callback){
        return new Ajax(url, {
            method: 'GET',
            onSuccess: function(response){
                callback(response.responseJSON || response.responseText, response);
            }
        });
    };

    /**
     * Loads content from a given url through an XMLHttpRequest.
     * Shortcut function for simple AJAX use cases.
     *
     * @method ping
     * @param {String}   url        Request url
     * @param {Function} callback   Callback to be executed if the request is successful
     * @return {Object}             XMLHttpRequest object
     */
    Ajax.ping = function(url, callback){
        return new Ajax(url, {
            method: 'HEAD',
            onSuccess: function(response){
                if (typeof callback === 'function'){
                    callback(response);
                }
            }
        });
    };


    return Ajax;
});

/**
 * Cross Browser JsonP requests
 * @module Ink.Net.JsonP_1
 * @version 1
 */

Ink.createModule('Ink.Net.JsonP', '1', [], function() {

    'use strict';

    /**
     * Executes a JSONP request
     *
     * @class Ink.Net.JsonP
     * @constructor
     *
     * @param {String}      uri                         Request URL
     * @param {Object}      options                     Request options
     * @param {Function}    options.onSuccess           Success callback
     * @param {Function}    [options.onFailure]         Failure callback
     * @param {Object}      [options.failureObj]        Object to be passed as argument to failure callback
     * @param {Number}      [options.timeout]           Timeout for request fail, in seconds. defaults to 10
     * @param {Object}      [options.params]            Object with the parameters and respective values to unfold
     * @param {String}      [options.callbackParam]     Parameter to use as callback. defaults to 'jsoncallback'
     * @param {String}      [options.internalCallback]  Name of the callback function stored in the Ink.Net.JsonP object.
     *
     * @sample Ink_Net_JsonP_1.html 
     */
    var JsonP = function(uri, options) {
        this.init(uri, options);
    };

    JsonP.prototype = {

        init: function(uri, options) {
            this.options = Ink.extendObj( {
                onSuccess:         undefined,
                onFailure:          undefined,
                failureObj:         {},
                timeout:            10,
                params:             {},
                callbackParam:      'jsoncallback',
                internalCallback:   '_cb',
                randVar:            false
            }, options || {});

            if(this.options.randVar !== false) {
                this.randVar = this.options.randVar;
            } else {
                this.randVar = parseInt(Math.random() * 100000, 10);
            }

            this.options.internalCallback += this.randVar;

            this.uri = uri;

            // prevent SAPO legacy onComplete - make it onSuccess
            if(typeof(this.options.onComplete) === 'function') {
                this.options.onSuccess = this.options.onComplete;
            }

            if (typeof this.uri !== 'string') {
                throw 'Please define an URI';
            }

            if (typeof this.options.onSuccess !== 'function') {
                throw 'please define a callback function on option onSuccess!';
            }

            Ink.Net.JsonP[this.options.internalCallback] = Ink.bind(function() {
                window.clearTimeout(this.timeout);
                delete window.Ink.Net.JsonP[this.options.internalCallback];
                this._removeScriptTag();
                this.options.onSuccess(arguments[0]);
            }, this);

            this._addScriptTag();
        },

        _addParamsToGet: function(uri, params) {
            var hasQuestionMark = uri.indexOf('?') !== -1;
            var sep, pKey, pValue, parts = [uri];

            for (pKey in params) {
                if (params.hasOwnProperty(pKey)) {
                    if (!hasQuestionMark) { sep = '?';  hasQuestionMark = true; }
                    else {                  sep = '&';                          }
                    pValue = params[pKey];
                    if (typeof pValue !== 'number' && !pValue) {    pValue = '';    }
                    parts = parts.concat([sep, pKey, '=', encodeURIComponent(pValue)]);
                }
            }

            return parts.join('');
        },

        _getScriptContainer: function() {
            var headEls = document.getElementsByTagName('head');
            if (headEls.length === 0) {
                var scriptEls = document.getElementsByTagName('script');
                return scriptEls[0];
            }
            return headEls[0];
        },

        _addScriptTag: function() {
            // enrich options will callback and random seed
            this.options.params[this.options.callbackParam] = 'Ink.Net.JsonP.' + this.options.internalCallback;
            this.options.params.rnd_seed = this.randVar;
            this.uri = this._addParamsToGet(this.uri, this.options.params);
            // create script tag
            var scriptEl = document.createElement('script');
            scriptEl.type = 'text/javascript';
            scriptEl.src = this.uri;
            var scriptCtn = this._getScriptContainer();
            scriptCtn.appendChild(scriptEl);
            this.timeout = setTimeout(Ink.bind(this._requestFailed, this), (this.options.timeout * 1000));
        },

        _requestFailed : function () {
            delete Ink.Net.JsonP[this.options.internalCallback];
            this._removeScriptTag();
            if(typeof this.options.onFailure === 'function'){
                this.options.onFailure(this.options.failureObj);
            }
        },

        _removeScriptTag: function() {
            var scriptEl;
            var scriptEls = document.getElementsByTagName('script');
            var scriptUri;
            for (var i = 0, f = scriptEls.length; i < f; ++i) {
                scriptEl = scriptEls[i];
                scriptUri = scriptEl.getAttribute('src') || scriptEl.src;
                if (scriptUri !== null && scriptUri === this.uri) {
                    scriptEl.parentNode.removeChild(scriptEl);
                    return;
                }
            }
        }

    };

    return JsonP;

});

/**
 * Browser Detection and User Agent sniffing
 * @module Ink.Dom.Browser_1
 * @version 1
 */
Ink.createModule('Ink.Dom.Browser', '1', [], function() {
    'use strict';    

    /**
     * @namespace Ink.Dom.Browser
     * @version 1
     * @static
     * @example
     *     <script>
     *         Ink.requireModules(['Ink.Dom.Browser_1'],function( InkBrowser ){
     *             if( InkBrowser.CHROME ){
     *                 console.log( 'This is a CHROME browser.' );
     *             }
     *         });
     *     </script>
     */
    var Browser = {
        /**
         * True if the browser is Internet Explorer
         *
         * @property IE
         * @type {Boolean}
         * @public
         * @static
         */
        IE: false,

        /**
         * True if the browser is Gecko based
         *
         * @property GECKO
         * @type {Boolean}
         * @public
         * @static
         */
        GECKO: false,

        /**
         * True if the browser is Opera
         *
         * @property OPERA
         * @type {Boolean}
         * @public
         * @static
         */
        OPERA: false,

        /**
         * True if the browser is Safari
         *
         * @property SAFARI
         * @type {Boolean}
         * @public
         * @static
         */
        SAFARI: false,

        /**
         * True if the browser is Konqueror
         *
         * @property KONQUEROR
         * @type {Boolean}
         * @public
         * @static
         */
        KONQUEROR: false,

        /**
         * True if browser is Chrome
         *
         * @property CHROME
         * @type {Boolean}
         * @public
         * @static
         */
        CHROME: false,

        /**
         * The specific browser model.
         * False if it is unavailable.
         *
         * @property model
         * @type {Boolean|String}
         * @public
         * @static
         */
        model: false,

        /**
         * The browser version.
         * False if it is unavailable.
         *
         * @property version
         * @type {Boolean|String}
         * @public
         * @static
         */
        version: false,

        /**
         * The user agent string.
         * False if it is unavailable.
         *
         * @property userAgent
         * @type {Boolean|String}
         * @public
         * @static
         */
        userAgent: false,

        /**
         * The CSS prefix (-moz-, -webkit-, -ms-, ...)
         * False if it is unavailable 
         *
         * @property cssPrefix 
         * @type {Boolean|String}
         * @public 
         * @static 
         */
        cssPrefix: false, 

        /**
         * The DOM prefix (Moz, Webkit, ms, ...)
         * False if it is unavailable 
         * @property domPrefix 
         * @type {Boolean|String}
         * @public 
         * @static 
         */
        domPrefix: false,

        /**
         * Initialization function for the Browser object.
         *
         * Is called automatically when this module is loaded, and calls setDimensions, setBrowser and setReferrer.
         *
         * @method init
         * @public
         */
        init: function() {
            this.detectBrowser();
            this.setDimensions();
            this.setReferrer();
        },

        /**
         * Retrieves and stores window dimensions in this object. Called automatically when this module is loaded.
         *
         * @method setDimensions
         * @public
         */
        setDimensions: function() {
            //this.windowWidth=window.innerWidth !== null? window.innerWidth : document.documentElement && document.documentElement.clientWidth ? document.documentElement.clientWidth : document.body !== null ? document.body.clientWidth : null;
            //this.windowHeight=window.innerHeight != null? window.innerHeight : document.documentElement && document.documentElement.clientHeight ? document.documentElement.clientHeight : document.body != null? document.body.clientHeight : null;
            var myWidth = 0, myHeight = 0;
            if ( typeof window.innerWidth=== 'number' ) {
                myWidth = window.innerWidth;
                myHeight = window.innerHeight;
            } else if( document.documentElement && ( document.documentElement.clientWidth || document.documentElement.clientHeight ) ) {
                myWidth = document.documentElement.clientWidth;
                myHeight = document.documentElement.clientHeight;
            } else if( document.body && ( document.body.clientWidth || document.body.clientHeight ) ) {
                myWidth = document.body.clientWidth;
                myHeight = document.body.clientHeight;
            }
            this.windowWidth = myWidth;
            this.windowHeight = myHeight;
        },

        /**
         * Stores the referrer. Called automatically when this module is loaded.
         *
         * @method setReferrer
         * @public
         */
        setReferrer: function() {
            if (document.referrer && document.referrer.length) {
                this.referrer = window.escape(document.referrer);
            } else {
                this.referrer = false;
            }
        },

        /**
         * Detects the browser and stores the found properties. Called automatically when this module is loaded.
         *
         * @method detectBrowser
         * @public
         */
        detectBrowser: function() {
            this._sniffUserAgent(navigator.userAgent);
        },

        _sniffUserAgent: function (sAgent) {
            this.userAgent = sAgent;

            sAgent = sAgent.toLowerCase();

            if (/applewebkit\//.test(sAgent)) {
                this.cssPrefix = '-webkit-';
                this.domPrefix = 'Webkit';
                if(/(chrome|crios)\//.test(sAgent)) {
                    // Chrome
                    this.CHROME = true;
                    this.model = 'chrome';
                    this.version = sAgent.replace(/(.*)chrome\/([^\s]+)(.*)/, "$2");
                } else {
                    // Safari
                    this.SAFARI = true;
                    this.model = 'safari';
                    var rVersion = /version\/([^) ]+)/;
                    if (rVersion.test(sAgent)) {
                        this.version = sAgent.match(rVersion)[1];
                    } else {
                        this.version = sAgent.replace(/(.*)applewebkit\/([^\s]+)(.*)/, "$2");
                    }
                }
            } else if (/opera/.test(sAgent)) {
                // Opera
                this.OPERA = true;
                this.model = 'opera';
                this.version = sAgent.replace(/(.*)opera.([^\s$]+)(.*)/, "$2");
                this.cssPrefix = '-o-';
                this.domPrefix = 'O';
            } else if (/konqueror/.test(sAgent)) {
                // Konqueroh
                this.KONQUEROR = true;
                this.model = 'konqueror';
                this.version = sAgent.replace(/(.*)konqueror\/([^;]+);(.*)/, "$2");
                this.cssPrefix = '-khtml-';
                this.domPrefix = 'Khtml';
            } else if (/(msie|trident)/i.test(sAgent)) {
                // MSIE
                this.IE = true;
                this.model = 'ie';
                if (/rv:((?:\d|\.)+)/.test(sAgent)) {  // IE 11
                    this.version = sAgent.match(/rv:((?:\d|\.)+)/)[1];
                } else {
                    this.version = sAgent.replace(/(.*)\smsie\s([^;]+);(.*)/, "$2");
                }
                this.cssPrefix = '-ms-';
                this.domPrefix = 'ms';
            } else if (/gecko/.test(sAgent)) {
                // GECKO
                // Supports only:
                // Camino, Chimera, Epiphany, Minefield (firefox 3), Firefox, Firebird, Phoenix, Galeon,
                // Iceweasel, K-Meleon, SeaMonkey, Netscape, Songbird, Sylera,
                this.cssPrefix = '-moz-';
                this.domPrefix = 'Moz';

                this.GECKO = true;

                var re = /(camino|chimera|epiphany|minefield|firefox|firebird|phoenix|galeon|iceweasel|k\-meleon|seamonkey|netscape|songbird|sylera)/;
                if(re.test(sAgent)) {
                    this.model = sAgent.match(re)[1];
                    this.version = sAgent.replace(new RegExp("(.*)"+this.model+"\/([^;\\s$]+)(.*)"), "$2");
                } else {
                    // probably is mozilla
                    this.model = 'mozilla';
                    var reVersion = /(.*)rv:([^)]+)(.*)/;
                    if(reVersion.test(sAgent)) {
                        this.version = sAgent.replace(reVersion, "$2");
                    }
                }
            }
        },

        /**
         * Debug function which displays browser (and Ink.Dom.Browser) information as an alert message.
         *
         * @method debug
         * @public
         * @sample Ink_Dom_Browser_1_debug.html
         */
        debug: function() {
            /*global alert:false */
            var str = "known browsers: (ie, gecko, opera, safari, konqueror) \n";
                str += [this.IE, this.GECKO, this.OPERA, this.SAFARI, this.KONQUEROR] +"\n";
                str += "cssPrefix -> "+this.cssPrefix+"\n";
                str += "domPrefix -> "+this.domPrefix+"\n";
                str += "model -> "+this.model+"\n";
                str += "version -> "+this.version+"\n";
                str += "\n";
                str += "original UA -> "+this.userAgent;

            alert(str);
        }
    };

    Browser.init();

    return Browser;
});

/**
 * CSS Utilities and toolbox
 * @module Ink.Dom.Css_1
 * @version 1
 */

Ink.createModule( 'Ink.Dom.Css', 1, [], function() {

    'use strict';

     // getComputedStyle feature detection.
     var getCs = ("defaultView" in document) && ("getComputedStyle" in document.defaultView) ? document.defaultView.getComputedStyle : window.getComputedStyle;

    /**
     * @namespace Ink.Dom.Css
     * @static
     */

    var Css = {
        /**
         * Adds of removes a class.
         * Depending on addRemState, this method either adds a class if it's true or removes if if false.
         *
         * @method addRemoveClassName
         * @param {DOMElement|string}   elm          DOM element or element id
         * @param {string}              className    class name to add or remove.
         * @param {boolean}             addRemState  Whether to add or remove. `true` to add, `false` to remove.
         * @sample Ink_Dom_Css_addRemoveClassName.html 
         */
        addRemoveClassName: function(elm, className, addRemState) {
            if (addRemState) {
                return this.addClassName(elm, className);
            }
            this.removeClassName(elm, className);
        },

        /**
         * Adds a class to a given element
         *
         * @method addClassName
         * @param {DOMElement|String}   elm          DOM element or element id
         * @param {String|Array}        className    Classes 
         * @sample Ink_Dom_Css_addClassName.html
         */
        addClassName: function(elm, className) {
            elm = Ink.i(elm);
            if (!elm || !className) { return null; }
            className = ('' + className).split(/[, ]+/);
            var i = 0;
            var len = className.length;

            for (; i < len; i++) {
                if (typeof elm.classList !== "undefined") {
                    elm.classList.add(className[i]);
                } else if (!Css.hasClassName(elm, className[i])) {
                    elm.className += (elm.className ? ' ' : '') + className[i];
                }
            }
        },

        /**
         * Removes a class from a given element
         *
         * @method removeClassName
         * @param {DOMElement|String}   elm        DOM element or element id
         * @param {String|Array}        className  Class names to remove. You can either use a space separated string of classnames, comma-separated list or an array
         * @sample Ink_Dom_Css_removeClassName.html 
         */
        removeClassName: function(elm, className) {
            elm = Ink.i(elm);
            if (!elm || !className) { return null; }
            
            className = ('' + className).split(/[, ]+/);
            var i = 0;
            var len = className.length;

            if (typeof elm.classList !== "undefined"){
                for (; i < len; i++) {
                    elm.classList.remove(className[i]);
                }
            } else {
                var elmClassName = elm.className || '';
                var re;
                for (; i < len; i++) {
                    re = new RegExp("(^|\\s+)" + className[i] + "(\\s+|$)");
                    elmClassName = elmClassName.replace(re, ' ');
                }
                elm.className = (elmClassName
                    .replace(/^\s+/, '')
                    .replace(/\s+$/, ''));
            }
        },

        /**
         * Alias to addRemoveClassName. 
         * Utility function, saves many if/elses.
         *
         * @method setClassName
         * @uses addRemoveClassName
         * @param {DOMElement|String}  elm          DOM element or element id
         * @param {String|Array}       className    Class names to add\remove. Comma separated, space separated or simply an Array
         * @param {Boolean}            [add]=false  Flag to switch behavior from removal to addition. true to add, false to remove
         */
        setClassName: function(elm, className, add) {
            this.addRemoveClassName(elm, className, add || false);
        },

        /**
         * Checks if an element has a class.
         * This method verifies if an element has ONE of a list of classes. If the last argument is flagged as true, instead checks if the element has ALL the classes
         * 
         * @method hasClassName
         * @param {DOMElement|String}  elm         DOM element or element id
         * @param {String|Array}       className   Class names to test
         * @param {Boolean}            [all]=false If flagged as true, it will check if the element contains ALL the CSS classes
         * @return {Boolean} true if a given class is applied to a given element
         * @sample Ink_Dom_Css_hasClassName.html 
         */
        hasClassName: function(elm, className, all) {
            elm = Ink.i(elm);
            if (!elm || !className) { return false; }

            className = ('' + className).split(/[, ]+/);
            var i = 0;
            var len = className.length;
            var has;
            var re;

            for ( ; i < len; i++) {
                if (typeof elm.classList !== "undefined"){
                    has = elm.classList.contains(className[i]);
                } else {
                    var elmClassName = elm.className;
                    if (elmClassName === className[i]) {
                        has = true;
                    } else {
                        re = new RegExp("(^|\\s)" + className[i] + "(\\s|$)");
                        has = re.test(elmClassName);
                    }
                }
                if (has && !all) { return true; }  // return if looking for any class
                if (!has && all) { return false; }  // return if looking for all classes
            }

            if (all) {
                // if we got here, all classes were found so far
                return true;
            } else {
                // if we got here with all == false, no class was found
                return false;
            }
        },

        /**
         * Blinks a class from an element
         * Add and removes the class from the element with a timeout, so it blinks
         *
         * @method blinkClass
         * @uses addRemoveClassName
         * @param {DOMElement|String}  elm        DOM element or element id
         * @param {String|Array}       className  Class name(s) to blink
         * @param {Number}            timeout    timeout in ms between adding and removing, default 100 ms
         * @param {Boolean}            negate     is true, class is removed then added
         * @sample Ink_Dom_Css_blinkClass.html 
         */
        blinkClass: function(element, className, timeout, negate){
            element = Ink.i(element);
            Css.addRemoveClassName(element, className, !negate);
            setTimeout(function() {
                Css.addRemoveClassName(element, className, negate);
            }, Number(timeout) || 100);
        },

        /**
         * Toggles a class name from a given element
         *
         * @method toggleClassName
         * @param {DOMElement|String}  elm        DOM element or element id
         * @param {String}             className  Class name
         * @param {Boolean}            [forceAdd] Flag to force adding the the classe names if they don't exist yet.
         * @sample Ink_Dom_Css_toggleClassName.html 
         */
        toggleClassName: function(elm, className, forceAdd) {
            if (elm && className){
                if (typeof elm.classList !== "undefined" && !/[, ]/.test(className)){
                    elm = Ink.i(elm);
                    if (elm !== null){
                        elm.classList.toggle(className);
                    }
                    return true;
                }
            }

            if (typeof forceAdd !== 'undefined') {
                if (forceAdd === true) {
                    Css.addClassName(elm, className);
                }
                else if (forceAdd === false) {
                    Css.removeClassName(elm, className);
                }
            } else {
                if (Css.hasClassName(elm, className)) {
                    Css.removeClassName(elm, className);
                } else {
                    Css.addClassName(elm, className);
                }
            }
        },

        /**
         * Sets the opacity of given element 
         *
         * @method setOpacity
         * @param {DOMElement|String}  elm    DOM element or element id
         * @param {Number}             value  allows 0 to 1(default mode decimal) or percentage (warning using 0 or 1 will reset to default mode)
         * @sample Ink_Dom_Css_setOpacity.html 
         */
        setOpacity: function(elm, value) {
            elm = Ink.i(elm);
            if (elm !== null){
                var val = 1;

                if (!isNaN(Number(value))){
                    if      (value <= 0) {   val = 0;           }
                    else if (value <= 1) {   val = value;       }
                    else if (value <= 100) { val = value / 100; }
                    else {                   val = 1;           }
                }

                if (typeof elm.style.opacity !== 'undefined') {
                    elm.style.opacity = val;
                }
                else {
                    elm.style.filter = "alpha(opacity:"+(val*100|0)+")";
                }
            }
        },

        /**
         * Converts a css property name to a string in camelcase to be used with CSSStyleDeclaration.
         * @method _camelCase
         * @private
         * @param {String} str  String to convert
         * @return {String} Converted string
         */
        _camelCase: function(str) {
            return str ? str.replace(/-(\w)/g, function (_, $1) {
                return $1.toUpperCase();
            }) : str;
        },


        /**
         * Gets the value for an element's style attribute
         *
         * @method getStyle
         * @param {DOMElement|String}  elm    DOM element or element id
         * @param {String}             style  Which css attribute to fetch
         * @return Style value
         * @sample Ink_Dom_Css_getStyle.html 
         */
         getStyle: function(elm, style) {
             elm = Ink.i(elm);
             if (elm !== null) {
                 style = style === 'float' ? 'cssFloat': this._camelCase(style);

                 var value = elm.style[style];

                 if (getCs && (!value || value === 'auto')) {
                     var css = getCs(elm, null);
                     value = css ? css[style] : null;
                 }
                 else if (!value && elm.currentStyle) {
                      value = elm.currentStyle[style];
                      if (value === 'auto' && (style === 'width' || style === 'height')) {
                        value = elm["offset" + style.charAt(0).toUpperCase() + style.slice(1)] + "px";
                      }
                 }

                 if (style === 'opacity') {
                     return value ? parseFloat(value, 10) : 1.0;
                 }
                 else if (style === 'borderTopWidth'   || style === 'borderBottomWidth' ||
                          style === 'borderRightWidth' || style === 'borderLeftWidth'       ) {
                      if      (value === 'thin') {      return '1px';   }
                      else if (value === 'medium') {    return '3px';   }
                      else if (value === 'thick') {     return '5px';   }
                 }

                 return value === 'auto' ? null : value;
             }
         },


        /**
         * Adds CSS rules to an element's style attribute.
         *
         * @method setStyle
         * @param {DOMElement|String}  elm    DOM element or element id
         * @param {String}             style  Which css attribute to set
         * @sample Ink_Dom_Css_setStyle.html 
         */
        setStyle: function(elm, style) {
            elm = Ink.i(elm);
            if (elm === null) { return; }
            if (typeof style === 'string') {
                elm.style.cssText += '; '+style;

                if (style.indexOf('opacity') !== -1) {
                    this.setOpacity(elm, style.match(/opacity:\s*(\d?\.?\d*)/)[1]);
                }
            }
            else {
                for (var prop in style) {
                    if (style.hasOwnProperty(prop)){
                        if (prop === 'opacity') {
                            this.setOpacity(elm, style[prop]);
                        }
                        else if (prop === 'float' || prop === 'cssFloat') {
                            if (typeof elm.style.styleFloat === 'undefined') {
                                elm.style.cssFloat = style[prop];
                            }
                            else {
                                elm.style.styleFloat = style[prop];
                            }
                        } else {
                            elm.style[prop] = style[prop];
                        }
                    }
                }
            }
        },


        /**
         * Shows an element.
         * Internally it unsets the display property of an element. You can force a specific display property using forceDisplayProperty
         *
         * @method show
         * @param {DOMElement|String}  elm                      DOM element or element id
         * @param {String}             [forceDisplayProperty]   Css display property to apply on show
         * @sample Ink_Dom_Css_show.html 
         */
        show: function(elm, forceDisplayProperty) {
            elm = Ink.i(elm);
            if (elm !== null) {
                elm.style.display = (forceDisplayProperty) ? forceDisplayProperty : '';
            }
        },

        /**
         * Hides an element.
         *
         * @method hide
         * @param {DOMElement|String}  elm  DOM element or element id
         * @sample Ink_Dom_Css_hide.html 
         */
        hide: function(elm) {
            elm = Ink.i(elm);
            if (elm !== null) {
                elm.style.display = 'none';
            }
        },

        /**
         * Shows or hides an element.
         * If the show parameter is true, it shows the element. Otherwise, hides it.
         *
         * @method showHide
         * @param {DOMElement|String}  elm          DOM element or element id
         * @param {boolean}            [show]=false Whether to show or hide `elm`.
         * @sample Ink_Dom_Css_showHide.html 
         */
        showHide: function(elm, show) {
            elm = Ink.i(elm);
            if (elm) {
                elm.style.display = show ? '' : 'none';
            }
        },

        /**
         * Toggles an element visibility.
         * 
         * @method toggle
         * @param {DOMElement|String}  elm        DOM element or element id
         * @param {Boolean}            forceShow  Forces showing if element is hidden
         * @sample Ink_Dom_Css_toggle.html 
         */
        toggle: function(elm, forceShow) {
            elm = Ink.i(elm);
            if (elm !== null) {
                if (typeof forceShow !== 'undefined') {
                    if (forceShow === true) {
                        this.show(elm);
                    } else {
                        this.hide(elm);
                    }
                } else {
                    if (this.getStyle(elm,'display').toLowerCase() === 'none') {
                        this.show(elm);
                    }
                    else {
                        this.hide(elm);
                    }
                }
            }
        },

        _getRefTag: function(head){
            if (head.firstElementChild) {
                return head.firstElementChild;
            }

            for (var child = head.firstChild; child; child = child.nextSibling){
                if (child.nodeType === 1){
                    return child;
                }
            }
            return null;
        },

        /**
         * Injects style tags with rules to the page.
         *
         * @method appendStyleTag
         * @param {String}  selector  The css selector for the rule
         * @param {String}  style     The content of the style rule
         * @param {Object}  options   Options for the tag
         *    @param {String}  [options.type]='text/css'   File type
         *    @param {Boolean} [options.force]=false  If true, the style tag will be appended to end of head
         * 
         * @sample Ink_Dom_Css_appendStyleTag.html 
         */
        appendStyleTag: function(selector, style, options){
            options = Ink.extendObj({
                type: 'text/css',
                force: false
            }, options || {});

            var styles = document.getElementsByTagName("style"),
                oldStyle = false, setStyle = true, i, l;

            for (i=0, l=styles.length; i<l; i++) {
                oldStyle = styles[i].innerHTML;
                if (oldStyle.indexOf(selector) >= 0) {
                    setStyle = false;
                }
            }

            if (setStyle) {
                var defStyle = document.createElement("style"),
                    head = document.getElementsByTagName("head")[0],
                    refTag = false, styleStr = '';

                defStyle.type  = options.type;

                styleStr += selector +" {";
                styleStr += style;
                styleStr += "} ";

                if (typeof defStyle.styleSheet !== "undefined") {
                    defStyle.styleSheet.cssText = styleStr;
                } else {
                    defStyle.appendChild(document.createTextNode(styleStr));
                }

                if (options.force){
                    head.appendChild(defStyle);
                } else {
                    refTag = this._getRefTag(head);
                    if (refTag){
                        head.insertBefore(defStyle, refTag);
                    }
                }
            }
        },

        /**
         * Injects an external link tag.
         * This method add a stylesheet to the head of a page
         *
         * @method appendStylesheet
         * @param {String}  path     File path
         * @param {Object}  options  Options for the tag
         *    @param {String}   [options.media]='screen'    Media type
         *    @param {String}   [options.type]='text/css'   File type
         *    @param {Boolean}  [options.force]=false       If true, tag will be appended to end of head
         * @sample Ink_Dom_Css_appendStylesheet.html 
         */
        appendStylesheet: function(path, options){
            options = Ink.extendObj({
                media: 'screen',
                type: 'text/css',
                force: false
            }, options || {});

            var refTag,
                style = document.createElement("link"),
                head = document.getElementsByTagName("head")[0];

            style.media = options.media;
            style.type = options.type;
            style.href = path;
            style.rel = "Stylesheet";

            if (options.force){
                head.appendChild(style);
            }
            else {
                refTag = this._getRefTag(head);
                if (refTag){
                    head.insertBefore(style, refTag);
                }
            }
        },

        /**
         * Injects an external link tag.
         * Loads CSS via LINK element inclusion in HEAD (skips append if already there)
         *
         * Works similarly to appendStylesheet but:
         *   supports optional callback which gets invoked once the CSS has been applied
         *
         * @method appendStylesheetCb
         * @param {String}            cssURI      URI of the CSS to load, if empty ignores and just calls back directly
         * @param {Function(cssURI)}  [callback]  optional callback which will be called once the CSS is loaded
         * @sample Ink_Dom_Css_appendStylesheetCb.html 
         */
        _loadingCSSFiles: {},
        _loadedCSSFiles:  {},
        appendStylesheetCb: function(url, callback) {
            if (!url) {
                return callback(url);
            }

            if (this._loadedCSSFiles[url]) {
                return callback(url);
            }

            var cbs = this._loadingCSSFiles[url];
            if (cbs) {
                return cbs.push(callback);
            }

            this._loadingCSSFiles[url] = [callback];

            var linkEl = document.createElement('link');
            linkEl.type = 'text/css';
            linkEl.rel  = 'stylesheet';
            linkEl.href = url;

            var headEl = document.getElementsByTagName('head')[0];
            headEl.appendChild(linkEl);

            var imgEl = document.createElement('img');
            /*
            var _self = this;
            (function(_url) {
                imgEl.onerror = function() {
                    //var url = this;
                    var url = _url;
                    _self._loadedCSSFiles[url] = true;
                    var callbacks = _self._loadingCSSFiles[url];
                    for (var i = 0, f = callbacks.length; i < f; ++i) {
                        callbacks[i](url);
                    }
                    delete _self._loadingCSSFiles[url];
                };
            })(url);
            */
            imgEl.onerror = Ink.bindEvent(function(event, _url) {
                //var url = this;
                var url = _url;
                this._loadedCSSFiles[url] = true;
                var callbacks = this._loadingCSSFiles[url];
                for (var i = 0, f = callbacks.length; i < f; ++i) {
                    callbacks[i](url);
                }
                delete this._loadingCSSFiles[url];
            }, this, url);
            imgEl.src = url;
        },

        /**
         * Converts decimal to hexadecimal values
         * Useful to convert colors to their hexadecimal representation.
         *
         * @method decToHex
         * @param {String} dec Either a single decimal value, an rgb(r, g, b) string or an Object with r, g and b properties
         * @return {String} Hexadecimal value
         * @sample Ink_Dom_Css_decToHex.html 
         */
        decToHex: function(dec) {
            var normalizeTo2 = function(val) {
                if (val.length === 1) {
                    val = '0' + val;
                }
                val = val.toUpperCase();
                return val;
            };

            if (typeof dec === 'object') {
                var rDec = normalizeTo2(parseInt(dec.r, 10).toString(16));
                var gDec = normalizeTo2(parseInt(dec.g, 10).toString(16));
                var bDec = normalizeTo2(parseInt(dec.b, 10).toString(16));
                return rDec+gDec+bDec;
            }
            else {
                dec += '';
                var rgb = dec.match(/\((\d+),\s?(\d+),\s?(\d+)\)/);
                if (rgb !== null) {
                    return  normalizeTo2(parseInt(rgb[1], 10).toString(16)) +
                            normalizeTo2(parseInt(rgb[2], 10).toString(16)) +
                            normalizeTo2(parseInt(rgb[3], 10).toString(16));
                }
                else {
                    return normalizeTo2(parseInt(dec, 10).toString(16));
                }
            }
        },

        /**
         * Converts hexadecimal values to decimal
         * Useful to use with CSS colors
         *
         * @method hexToDec
         * @param {String}  hex  hexadecimal Value with 6, 3, 2 or 1 characters
         * @return {Number} Object with properties r, g, b if length of number is >= 3 or decimal value instead.
         * @sample Ink_Dom_Css_hexToDec.html 
         */
        hexToDec: function(hex){
            if (hex.indexOf('#') === 0) {
                hex = hex.substr(1);
            }
            if (hex.length === 6) { // will return object RGB
                return {
                    r: parseInt(hex.substr(0,2), 16),
                    g: parseInt(hex.substr(2,2), 16),
                    b: parseInt(hex.substr(4,2), 16)
                };
            }
            else if (hex.length === 3) { // will return object RGB
                return {
                    r: parseInt(hex.charAt(0) + hex.charAt(0), 16),
                    g: parseInt(hex.charAt(1) + hex.charAt(1), 16),
                    b: parseInt(hex.charAt(2) + hex.charAt(2), 16)
                };
            }
            else if (hex.length <= 2) { // will return int
                return parseInt(hex, 16);
            }
        },

        /**
         * Get a single property from a stylesheet.
         * Use this to obtain the value of a CSS property (searched from loaded CSS documents)
         *
         * @method getPropertyFromStylesheet
         * @param {String}  selector  a CSS rule. must be an exact match
         * @param {String}  property  a CSS property
         * @return {String} value of the found property, or null if it wasn't matched
         */
        getPropertyFromStylesheet: function(selector, property) {
            var rule = this.getRuleFromStylesheet(selector);
            if (rule) {
                return rule.style[property];
            }
            return null;
        },

        getPropertyFromStylesheet2: function(selector, property) {
            var rules = this.getRulesFromStylesheet(selector);
            /*
            rules.forEach(function(rule) {
                var x = rule.style[property];
                if (x !== null && x !== undefined) {
                    return x;
                }
            });
            */
            var x;
            for(var i=0, t=rules.length; i < t; i++) {
                x = rules[i].style[property];
                if (x !== null && x !== undefined) {
                    return x;
                }
            }
            return null;
        },

        getRuleFromStylesheet: function(selector) {
            var sheet, rules, ri, rf, rule;
            var s = document.styleSheets;
            if (!s) {
                return null;
            }

            for (var si = 0, sf = document.styleSheets.length; si < sf; ++si) {
                sheet = document.styleSheets[si];
                rules = sheet.rules ? sheet.rules : sheet.cssRules;
                if (!rules) { return null; }

                for (ri = 0, rf = rules.length; ri < rf; ++ri) {
                    rule = rules[ri];
                    if (!rule.selectorText) { continue; }
                    if (rule.selectorText === selector) {
                        return rule;
                    }
                }
            }

            return null;
        },

        getRulesFromStylesheet: function(selector) {
            var res = [];
            var sheet, rules, ri, rf, rule;
            var s = document.styleSheets;
            if (!s) { return res; }

            for (var si = 0, sf = document.styleSheets.length; si < sf; ++si) {
                sheet = document.styleSheets[si];
                rules = sheet.rules ? sheet.rules : sheet.cssRules;
                if (!rules) {
                    return null;
                }

                for (ri = 0, rf = rules.length; ri < rf; ++ri) {
                    rule = rules[ri];
                    if (!rule.selectorText) { continue; }
                    if (rule.selectorText === selector) {
                        res.push(rule);
                    }
                }
            }

            return res;
        },

        getPropertiesFromRule: function(selector) {
            var rule = this.getRuleFromStylesheet(selector);
            var props = {};
            var prop, i, f;

            /*if (typeof rule.style.length === 'snumber') {
                for (i = 0, f = rule.style.length; i < f; ++i) {
                    prop = this._camelCase( rule.style[i]   );
                    props[prop] = rule.style[prop];
                }
            }
            else {  // HANDLES IE 8, FIREFOX RULE JOINING... */
                rule = rule.style.cssText;
                var parts = rule.split(';');
                var steps, val, pre, pos;
                for (i = 0, f = parts.length; i < f; ++i) {
                    if (parts[i].charAt(0) === ' ') {
                        parts[i] = parts[i].substring(1);
                    }
                    steps = parts[i].split(':');
                    prop = this._camelCase( steps[0].toLowerCase()  );
                    val = steps[1];
                    if (val) {
                        val = val.substring(1);

                        if (prop === 'padding' || prop === 'margin' || prop === 'borderWidth') {

                            if (prop === 'borderWidth') {   pre = 'border'; pos = 'Width';  }
                            else {                          pre = prop;     pos = '';       }

                            if (val.indexOf(' ') !== -1) {
                                val = val.split(' ');
                                props[pre + 'Top'   + pos]  = val[0];
                                props[pre + 'Bottom'+ pos]  = val[0];
                                props[pre + 'Left'  + pos]  = val[1];
                                props[pre + 'Right' + pos]  = val[1];
                            }
                            else {
                                props[pre + 'Top'   + pos]  = val;
                                props[pre + 'Bottom'+ pos]  = val;
                                props[pre + 'Left'  + pos]  = val;
                                props[pre + 'Right' + pos]  = val;
                            }
                        }
                        else if (prop === 'borderRadius') {
                            if (val.indexOf(' ') !== -1) {
                                val = val.split(' ');
                                props.borderTopLeftRadius       = val[0];
                                props.borderBottomRightRadius   = val[0];
                                props.borderTopRightRadius      = val[1];
                                props.borderBottomLeftRadius    = val[1];
                            }
                            else {
                                props.borderTopLeftRadius       = val;
                                props.borderTopRightRadius      = val;
                                props.borderBottomLeftRadius    = val;
                                props.borderBottomRightRadius   = val;
                            }
                        }
                        else {
                            props[prop] = val;
                        }
                    }
                }
            //}
            //console.log(props);

            return props;
        },

        /**
         * Change the font size of elements.
         * Changes the font size of the elements which match the given CSS rule
         * For this function to work, the CSS file must be in the same domain than the host page, otherwise JS can't access it.
         *
         * @method changeFontSize
         * @param {String}  selector  CSS selector rule
         * @param {Number}  delta     Number of pixels to change on font-size
         * @param {String}  [op]      Supported operations are '+' and '*'. defaults to '+'
         * @param {Number}  [minVal]  If result gets smaller than minVal, change does not occurr
         * @param {Number}  [maxVal]  If result gets bigger  than maxVal, change does not occurr
         */
        changeFontSize: function(selector, delta, op, minVal, maxVal) {
            var that = this;
            Ink.requireModules(['Ink.Dom.Selector_1'], function(Selector) {
                var e;
                if      (typeof selector !== 'string') { e = '1st argument must be a CSS selector rule.'; }
                else if (typeof delta    !== 'number') { e = '2nd argument must be a number.'; }
                else if (op !== undefined && op !== '+' && op !== '*') { e = '3rd argument must be one of "+", "*".'; }
                else if (minVal !== undefined && (typeof minVal !== 'number' || minVal <= 0)) { e = '4th argument must be a positive number.'; }
                else if (maxVal !== undefined && (typeof maxVal !== 'number' || maxVal < maxVal)) { e = '5th argument must be a positive number greater than minValue.'; }
                if (e) { throw new TypeError(e); }

                var val, el, els = Selector.select(selector);
                if (minVal === undefined) { minVal = 1; }
                op = (op === '*') ? function(a,b){return a*b;} : function(a,b){return a+b;};
                for (var i = 0, f = els.length; i < f; ++i) {
                    el = els[i];
                    val = parseFloat( that.getStyle(el, 'fontSize'));
                    val = op(val, delta);
                    if (val < minVal) { continue; }
                    if (typeof maxVal === 'number' && val > maxVal) { continue; }
                    el.style.fontSize = val + 'px';
                }
            });
        }

    };

    return Css;

});

/**
 * DOM Traversal and manipulation
 * @module Ink.Dom.Element_1
 * @version 1
 */

Ink.createModule('Ink.Dom.Element', 1, [], function() {

    'use strict';

    var createContextualFragmentSupport = (
        typeof document.createRange === 'function' &&
        typeof window.Range.prototype.createContextualFragment === 'function');

    var deleteThisTbodyToken = 'Ink.Dom.Element tbody: ' + Math.random();
    var browserCreatesTbodies = (function () {
        var div = document.createElement('div');
        div.innerHTML = '<table>';
        return div.getElementsByTagName('tbody').length !== 0;
    }());

    function rect(elem){
        var dimensions = {};
        try {
            dimensions = elem.getBoundingClientRect();
        } catch(e){
            dimensions = { top: elem.offsetTop, left: elem.offsetLeft };
        }
        return dimensions;
    }

    /**
     * @namespace Ink.Dom.Element_1
     */

    var InkElement = {

        /**
         * Shortcut for `document.getElementById`
         *
         * @method get
         * @param {String|DOMElement} elm   Either an ID of an element, or an element.
         * @return {DOMElement|null} The DOM element with the given id or null when it was not found
         * @sample Ink_Dom_Element_1_get.html
         */
        get: function(elm) {
            if(typeof elm !== 'undefined') {
                if(typeof elm === 'string') {
                    return document.getElementById(elm);
                }
                return elm;
            }
            return null;
        },

        /**
         * Creates a DOM element
         *
         * @method create
         * @param {String} tag        tag name
         * @param {Object} properties  object with properties to be set on the element. You can also call other functions in Ink.Dom.Element like this
         * @sample Ink_Dom_Element_1_create.html
         */
        create: function(tag, properties) {
            var el = document.createElement(tag);
            //Ink.extendObj(el, properties);
            for(var property in properties) {
                if(properties.hasOwnProperty(property)) {
                    if (property in InkElement) {
                        InkElement[property](el, properties[property]);
                    } else {
                        if(property === 'className' || property === 'class') {
                            el.className = properties.className || properties['class'];
                        } else {
                            el.setAttribute(property, properties[property]);
                        }
                    }
                }
            }
            return el;
        },

        /**
         * Removes a DOM Element
         *
         * @method remove
         * @param {DOMElement} elm  The element to remove
         * @sample Ink_Dom_Element_1_remove.html
         */
        remove: function(el) {
            el = Ink.i(el);
            var parEl;
            if (el && (parEl = el.parentNode)) {
                parEl.removeChild(el);
            }
        },

        /**
         * Scrolls the window to an element
         *
         * @method scrollTo
         * @param {DOMElement|String} elm  Element where to scroll
         * @sample Ink_Dom_Element_1_scrollTo.html
         */
        scrollTo: function(elm) {
            elm = InkElement.get(elm);
            if(elm) {
                if (elm.scrollIntoView) {
                    return elm.scrollIntoView();
                }

                var elmOffset = {},
                    elmTop = 0, elmLeft = 0;

                do {
                    elmTop += elm.offsetTop || 0;
                    elmLeft += elm.offsetLeft || 0;

                    elm = elm.offsetParent;
                } while(elm);

                elmOffset = {x: elmLeft, y: elmTop};

                window.scrollTo(elmOffset.x, elmOffset.y);
            }
        },

        /**
         * Gets the top offset of an element
         *
         * @method offsetTop
         * @uses Ink.Dom.Browser
         *
         * @param {DOMElement|String} elm  Target element
         * @return {Number} Offset from the target element to the top of the document
         * @sample Ink_Dom_Element_1_offsetTop.html
         */
        offsetTop: function(elm) {
            return InkElement.offset(elm)[1];
        },

        /**
         * Gets the left offset of an element
         *
         * @method offsetLeft
         * @uses Ink.Dom.Browser
         *
         * @param {DOMElement|String} elm  Target element
         * @return {Number} Offset from the target element to the left of the document
         * @sample Ink_Dom_Element_1_offsetLeft.html
         */
        offsetLeft: function(elm) {
            return InkElement.offset(elm)[0];
        },

        /**
        * Gets the relative offset of an element
        *
        * @method positionedOffset
        * @param {DOMElement|String} elm  Target element
        * @return {Array} Array with the element offsetleft and offsettop relative to the closest positioned ancestor
        * @sample Ink_Dom_Element_1_positionedOffset.html
        */
        positionedOffset: function(element) {
            var valueTop = 0, valueLeft = 0;
            element = InkElement.get(element);
            do {
                valueTop  += element.offsetTop  || 0;
                valueLeft += element.offsetLeft || 0;
                element = element.offsetParent;
                if (element) {
                    if (element.tagName.toLowerCase() === 'body') { break;  }

                    var value = element.style.position;
                    if (!value && element.currentStyle) {
                        value = element.currentStyle.position;
                    }
                    if ((!value || value === 'auto') && typeof getComputedStyle !== 'undefined') {
                        var css = getComputedStyle(element, null);
                        value = css ? css.position : null;
                    }
                    if (value === 'relative' || value === 'absolute') { break;  }
                }
            } while (element);
            return [valueLeft, valueTop];
        },

        /**
         * Gets the cumulative offset for an element
         *
         * Returns the top left position of the element on the page
         *
         * @method offset
         * @uses Ink.Dom.Browser
         *
         * @method offset
         * @param {DOMElement|String}   elm     Target element
         * @return {[Number, Number]}   Array with pixel distance from the target element to the top left corner of the document
         * @sample Ink_Dom_Element_1_offset.html
         */
        offset: function(el) {
            /*jshint boss:true */
            el = Ink.i(el);
            var res = [0, 0];
            var doc = el.ownerDocument,
                docElem = doc.documentElement,
                box = rect(el),
                body = doc.body,
                clientTop  = docElem.clientTop  || body.clientTop  || 0,
                clientLeft = docElem.clientLeft || body.clientLeft || 0,
                scrollTop  = doc.pageYOffset || docElem.scrollTop  || body.scrollTop,
                scrollLeft = doc.pageXOffset || docElem.scrollLeft || body.scrollLeft,
                top  = box.top  + scrollTop  - clientTop,
                left = box.left + scrollLeft - clientLeft;
            res = [left, top];
            return res;
        },

        /**
         * Gets the scroll of the element
         *
         * @method scroll
         * @param {DOMElement|String} [elm] Target element or document.body
         * @returns {Array} offset values for x and y scroll
         * @sample Ink_Dom_Element_1_scroll.html
         */
        scroll: function(elm) {
            elm = elm ? Ink.i(elm) : document.body;
            return [
                ( ( !window.pageXOffset ) ? elm.scrollLeft : window.pageXOffset ),
                ( ( !window.pageYOffset ) ? elm.scrollTop : window.pageYOffset )
            ];
        },

        _getPropPx: function(cs, prop) {
            var n, c;
            var val = cs.getPropertyValue ? cs.getPropertyValue(prop) : cs[prop];
            if (!val) { n = 0; }
            else {
                c = val.indexOf('px');
                if (c === -1) { n = 0; }
                else {
                    n = parseFloat(val, 10);
                }
            }

            //console.log([prop, ' "', val, '" ', n].join(''));

            return n;
        },

        /**
         * Alias for offset()
         *
         * @method offset2
         * @deprecated Kept for historic reasons. Use offset() instead.
         */
        offset2: function(el) {
            return InkElement.offset(el);
        },

        /**
         * Checks if an element has an attribute
         *
         * @method hasAttribute
         * @param {Object} elm   Target element
         * @param {String} attr  Attribute name
         * @return {Boolean} Boolean based on existance of attribute
         * @sample Ink_Dom_Element_1_hasAttribute.html
         */
        hasAttribute: function(elm, attr){
            elm = Ink.i(elm);
            return elm.hasAttribute ? elm.hasAttribute(attr) : !!elm.getAttribute(attr);
        },
        /**
         * Inserts an element right after another
         *
         * @method insertAfter
         * @param {DOMElement}         newElm     Element to be inserted
         * @param {DOMElement|String}  targetElm  Key element
         * @sample Ink_Dom_Element_1_insertAfter.html
         */
        insertAfter: function(newElm, targetElm) {
            /*jshint boss:true */
            if (targetElm = InkElement.get(targetElm)) {
                if (targetElm.nextSibling !== null) {
                    targetElm.parentNode.insertBefore(newElm, targetElm.nextSibling);
                } else {
                    targetElm.parentNode.appendChild(newElm);
                }
            }
        },

        /**
         * Inserts an element before another
         *
         * @method insertBefore
         * @param {DOMElement}         newElm     Element to be inserted
         * @param {DOMElement|String}  targetElm  Key element
         * @sample Ink_Dom_Element_1_insertBefore.html
         */
        insertBefore: function (newElm, targetElm) {
            /*jshint boss:true */
            if ( (targetElm = InkElement.get(targetElm)) ) {
                targetElm.parentNode.insertBefore(newElm, targetElm);
            }
        },

        /**
         * Inserts an element as the first child of another
         *
         * @method insertTop
         * @param {DOMElement}         newElm     Element to be inserted
         * @param {DOMElement|String}  targetElm  Key element
         * @sample Ink_Dom_Element_1_insertTop.html
         */
        insertTop: function(newElm,targetElm) {
            /*jshint boss:true */
            if (targetElm = InkElement.get(targetElm)) {
                if (targetElm.firstChild) {
                    targetElm.insertBefore(newElm, targetElm.firstChild);
                } else {
                    targetElm.appendChild(newElm);
                }
            }
        },

        /**
         * Inserts an element as the last child of another
         *
         * @method insertBottom
         * @param {DOMElement}         newElm     Element to be inserted
         * @param {DOMElement|String}  targetElm  Key element
         * @sample Ink_Dom_Element_1_insertBottom.html
         */
        insertBottom: function(newElm, targetElm) {
            /*jshint boss:true */
            targetElm = Ink.i(targetElm);
            targetElm.appendChild(newElm);
        },

        /**
         * Retrieves textContent from node
         *
         * @method textContent
         * @param {DOMNode} node Where to retreive text from. Can be any node type.
         * @return {String} the text
         * @sample Ink_Dom_Element_1_textContent.html
         */
        textContent: function(node){
            node = Ink.i(node);
            var text, k, cs, m;

            switch(node && node.nodeType) {
            case 9: /*DOCUMENT_NODE*/
                // IE quirks mode does not have documentElement
                return InkElement.textContent(node.documentElement || node.body && node.body.parentNode || node.body);

            case 1: /*ELEMENT_NODE*/
                text = node.innerText;
                if (typeof text !== 'undefined') {
                    return text;
                }
                /* falls through */
            case 11: /*DOCUMENT_FRAGMENT_NODE*/
                text = node.textContent;
                if (typeof text !== 'undefined') {
                    return text;
                }

                if (node.firstChild === node.lastChild) {
                    // Common case: 0 or 1 children
                    return InkElement.textContent(node.firstChild);
                }

                text = [];
                cs = node.childNodes;
                for (k = 0, m = cs.length; k < m; ++k) {
                    text.push( InkElement.textContent( cs[k] ) );
                }
                return text.join('');

            case 3: /*TEXT_NODE*/
            case 4: /*CDATA_SECTION_NODE*/
                return node.nodeValue;
            }
            return '';
        },

        /**
         * Replaces text content of a DOM Node
         * This method removes any child node previously present
         *
         * @method setTextContent
         * @param {DOMNode} node    node Target node where the text will be added.
         * @param {String}  text    text Text to be added on the node.
         * @sample Ink_Dom_Element_1_setTextContent.html
         */
        setTextContent: function(node, text){
            node = Ink.i(node);
            switch(node && node.nodeType)
            {
            case 1: /*ELEMENT_NODE*/
                if ('innerText' in node) {
                    node.innerText = text;
                    break;
                }
                /* falls through */
            case 11: /*DOCUMENT_FRAGMENT_NODE*/
                if ('textContent' in node) {
                    node.textContent = text;
                    break;
                }
                /* falls through */
            case 9: /*DOCUMENT_NODE*/
                while(node.firstChild) {
                    node.removeChild(node.firstChild);
                }
                if (text !== '') {
                    var doc = node.ownerDocument || node;
                    node.appendChild(doc.createTextNode(text));
                }
                break;

            case 3: /*TEXT_NODE*/
            case 4: /*CDATA_SECTION_NODE*/
                node.nodeValue = text;
                break;
            }
        },

        /**
         * Checks if an element is a link
         *
         * @method isLink
         * @param {DOMNode} node    Node to check if it's link
         * @return {Boolean}
         * @sample Ink_Dom_Element_1_isLink.html
         */
        isLink: function(element){
            var b = element && element.nodeType === 1 && ((/^a|area$/i).test(element.tagName) ||
                element.hasAttributeNS && element.hasAttributeNS('http://www.w3.org/1999/xlink','href'));
            return !!b;
        },

        /**
         * Checks if a node is an ancestor of another
         *
         * @method isAncestorOf
         * @param {DOMNode} ancestor  Ancestor node
         * @param {DOMNode} node      Descendant node
         * @return {Boolean}
         * @sample Ink_Dom_Element_1_isAncestorOf.html
         */
        isAncestorOf: function(ancestor, node){
            /*jshint boss:true */
            if (!node || !ancestor) {
                return false;
            }
            if (node.compareDocumentPosition) {
                return (ancestor.compareDocumentPosition(node) & 0x10) !== 0;/*Node.DOCUMENT_POSITION_CONTAINED_BY*/
            }
            while (node = node.parentNode){
                if (node === ancestor){
                    return true;
                }
            }
            return false;
        },

        /**
         * Checks if a node is descendant of another
         *
         * @method descendantOf
         * @param {DOMNode} node        The ancestor
         * @param {DOMNode} descendant  The descendant
         * @return {Boolean} true if 'descendant' is descendant of 'node'
         * @sample Ink_Dom_Element_1_descendantOf.html
         */
        descendantOf: function(node, descendant){
            return node !== descendant && InkElement.isAncestorOf(node, descendant);
        },

        /**
         * Get first child element of another
         * @method firstElementChild
         * @param {DOMElement} elm Parent node
         * @return {DOMElement} the Element child
         * @sample Ink_Dom_Element_1_firstElementChild.html
         */
        firstElementChild: function(elm){
            if(!elm) {
                return null;
            }
            if ('firstElementChild' in elm) {
                return elm.firstElementChild;
            }
            var child = elm.firstChild;
            while(child && child.nodeType !== 1) {
                child = child.nextSibling;
            }
            return child;
        },

        /**
         * Get the last child element of another
         * @method lastElementChild
         * @param {DOMElement} elm Parent node
         * @return {DOMElement} the Element child
         * @sample Ink_Dom_Element_1_lastElementChild.html
         */
        lastElementChild: function(elm){
            if(!elm) {
                return null;
            }
            if ('lastElementChild' in elm) {
                return elm.lastElementChild;
            }
            var child = elm.lastChild;
            while(child && child.nodeType !== 1) {
                child = child.previousSibling;
            }
            return child;
        },

        /**
         * Get the first sibling element after the node
         *
         * @method nextElementSibling
         * @param {DOMNode} node  The current node
         * @return {DOMElement|Null} The first sibling element after node or null if none is found
         * @sample Ink_Dom_Element_1_nextElementSibling.html 
         */
        nextElementSibling: function(node){
            var sibling = null;

            if(!node){ return sibling; }

            if("nextElementSibling" in node){
                return node.nextElementSibling;
            } else {
                sibling = node.nextSibling;

                // 1 === Node.ELEMENT_NODE
                while(sibling && sibling.nodeType !== 1){
                    sibling = sibling.nextSibling;
                }

                return sibling;
            }
        },

        /**
         * Get the first sibling element before the node
         *
         * @method previousElementSibling
         * @param {DOMNode}        node The current node
         * @return {DOMElement|Null} The first element sibling before node or null if none is found
         * @sample Ink_Dom_Element_1_previousElementSibling.html 
         */
        previousElementSibling: function(node){
            var sibling = null;

            if(!node){ return sibling; }

            if("previousElementSibling" in node){
                return node.previousElementSibling;
            } else {
                sibling = node.previousSibling;

                // 1 === Node.ELEMENT_NODE
                while(sibling && sibling.nodeType !== 1){
                    sibling = sibling.previousSibling;
                }

                return sibling;
            }
        },

        /**
         * Get an element's width in pixels.
         *
         * @method elementWidth
         * @param {DOMElement|String} element Target DOM element or target ID
         * @return {Number} The element's width
         * @sample Ink_Dom_Element_1_elementWidth.html 
         */
        elementWidth: function(element) {
            if(typeof element === "string") {
                element = document.getElementById(element);
            }
            return element.offsetWidth;
        },

        /**
         * Get an element's height in pixels.
         *
         * @method elementHeight
         * @param {DOMElement|String} element DOM element or target ID
         * @return {Number} The element's height
         * @sample Ink_Dom_Element_1_elementHeight.html 
         */
        elementHeight: function(element) {
            if(typeof element === "string") {
                element = document.getElementById(element);
            }
            return element.offsetHeight;
        },

        /**
         * Deprecated. Alias for offsetLeft()
         *
         * @method elementLeft
         * @param {DOMElement|String}       element     DOM element or target ID
         * @return {Number} Element's left position
         */
        elementLeft: function(element) {
            return InkElement.offsetLeft(element);
        },

        /**
         * Deprecated. Alias for offsetTop()
         *
         * @method elementTop
         * @param {DOMElement|string}   element     Target DOM element or target ID
         * @return {Number} element's top position
         */
        elementTop: function(element) {
            return InkElement.offsetTop(element);
        },

        /**
         * Get an element's dimensions in pixels.
         *
         * @method elementDimensions
         * @param {DOMElement|string}   element     DOM element or target ID
         * @return {Array} Array with element's width and height
         * @sample Ink_Dom_Element_1_elementDimensions.html 
         */
        elementDimensions: function(element) {
            element = Ink.i(element);
            return [element.offsetWidth, element.offsetHeight];
        },

        /**
         * Get the outer dimensions of an element in pixels.
         *
         * @method outerDimensions
         * @uses Ink.Dom.Css
         *
         * @param {DOMElement} element Target element
         * @return {Array} Array with element width and height.
         * @sample Ink_Dom_Element_1_outerDimensions.html 
         */
        outerDimensions: function (element) {
            var bbox = rect(element);

            var Css = Ink.getModule('Ink.Dom.Css_1');
            var getStyle = Ink.bindMethod(Css, 'getStyle', element);

            return [
                bbox.right - bbox.left + parseFloat(getStyle('marginLeft') || 0) + parseFloat(getStyle('marginRight') || 0),  // w
                bbox.bottom - bbox.top + parseFloat(getStyle('marginTop') || 0) + parseFloat(getStyle('marginBottom') || 0)  // h
            ];
        },

        /**
         * Check if an element is inside the viewport
         *
         * @method inViewport
         * @param {DOMElement} element DOM Element
         * @param {Object}  [options]  Options object. If you pass a Boolean value here, it is interpreted as `options.partial`
         * @param {Boolean} [options.partial]=false    Return `true` even if it is only partially visible.
         * @param {Number}  [options.margin]=0         Consider a margin all around the viewport with `opts.margin` width a dead zone.
         * @return {Boolean}
         * @sample Ink_Dom_Element_1_inViewport.html 
         */
        inViewport: function (element, opts) {
            var dims = rect(Ink.i(element));
            if (typeof opts === 'boolean') {
                opts = {partial: opts, margin: 0};
            }
            opts = Ink.extendObj({ partial: false, margin: 0}, opts || {});
            if (opts.partial) {
                return  dims.bottom + opts.margin > 0                           && // from the top
                        dims.left   - opts.margin < InkElement.viewportWidth()  && // from the right
                        dims.top    - opts.margin < InkElement.viewportHeight() && // from the bottom
                        dims.right  + opts.margin > 0;                             // from the left
            } else {
                return  dims.top    + opts.margin > 0                           && // from the top
                        dims.right  - opts.margin < InkElement.viewportWidth()  && // from the right
                        dims.bottom - opts.margin < InkElement.viewportHeight() && // from the bottom
                        dims.left   + opts.margin > 0;                             // from the left
            }
        },

        /**
         * Check if an element is hidden.
         * Taken from Mootools Element extras ( https://gist.github.com/cheeaun/73342 )
         * Does not take into account visibility:hidden
         * @method isHidden
         * @param {DOMElement} element Element to check
         * @return {Boolean}
         * @sample Ink_Dom_Element_1_isHidden.html 
         */

        isHidden: function (element) {
            var w = element.offsetWidth, 
                h = element.offsetHeight,
                force = (element.tagName.toLowerCase() === 'tr');

            var Css = Ink.getModule('Ink.Dom.Css_1');

            return (w===0 && h===0 && !force) ? true :
                (w!==0 && h!==0 && !force) ? false :
                Css.getStyle(element, 'display').toLowerCase() === 'none';
         },

        /**
         * Check if an element is visible 
         *
         * @method isVisible
         * @uses isHidden
         * @param {DOMElement} element Element to check
         * @return {Boolean}
         * @sample Ink_Dom_Element_1_isVisible.html 
         */

        isVisible: function (element) {
            return !this.isHidden(element);
        },

        /**
         * Clones an element's position to another
         *
         * @method clonePosition
         * @param {DOMElement} cloneTo    element to be position cloned
         * @param {DOMElement} cloneFrom  element to get the cloned position
         * @return {DOMElement} The element with positionClone
         * @sample Ink_Dom_Element_1_clonePosition.html 
         */
        clonePosition: function(cloneTo, cloneFrom){
            var pos = InkElement.offset(cloneFrom);
            cloneTo.style.left = pos[0]+'px';
            cloneTo.style.top = pos[1]+'px';

            return cloneTo;
        },

        /**
         * Text-overflow: ellipsis emulation
         * Slices off a piece of text at the end of the element and adds the ellipsis so all text fits inside.
         *
         * @method ellipsizeText
         * @param {DOMElement} element              Element to modify text content
         * @param {String}     [ellipsis]='\u2026'  String to append to the chopped text
         */
        ellipsizeText: function(element/*, ellipsis*/){
            if ((element = Ink.i(element))) {
                element.style.overflow = 'hidden';
                element.style.whiteSpace = 'nowrap';
                element.style.textOverflow = 'ellipsis';
            }
        },

        /**
         * Finds the closest ancestor element matching your test function
         * 
         *
         * @method findUpwardsHaving
         * @param {DOMElement} element     Element to base the search from
         * @param {Function}    boolTest   Testing function
         * @return {DOMElement|false} The matched element or false if did not match
         * @sample Ink_Dom_Element_1_findUpwardsHaving.html 
         */
        findUpwardsHaving: function(element, boolTest) {
            while (element && element.nodeType === 1) {
                if (boolTest(element)) {
                    return element;
                }
                element = element.parentNode;
            }
            return false;
        },

        /**
         * Finds the closest ancestor by class name
         *
         * @method findUpwardsByClass
         * @uses findUpwardsHaving
         * @param {DOMElement} element      Element to base the search from
         * @param {String}      className   Class name to search
         * @returns {DOMElement|false} The matched element or false if did not match
         * @sample Ink_Dom_Element_1_findUpwardsByClass.html 
         */
        findUpwardsByClass: function(element, className) {
            var re = new RegExp("(^|\\s)" + className + "(\\s|$)");
            var tst = function(el) {
                var cls = el.className;
                return cls && re.test(cls);
            };
            return InkElement.findUpwardsHaving(element, tst);
        },

        /**
         * Finds the closest ancestor by tag name
         *
         * @method findUpwardsByTag
         * @param {DOMElement} element  Element to base the search from
         * @param {String}      tag     Tag to search
         * @returns {DOMElement|false} the matched element or false if did not match
         * @sample Ink_Dom_Element_1_findUpwardsByTag.html 
         */
        findUpwardsByTag: function(element, tag) {
            tag = tag.toUpperCase();
            var tst = function(el) {
                return el.nodeName && el.nodeName.toUpperCase() === tag;
            };
            return InkElement.findUpwardsHaving(element, tst);
        },

        /**
         * Finds the closest ancestor by id
         *
         * @method findUpwardsById
         * @param {HtmlElement} element     Element to base the search from
         * @param {String}      id          ID to search
         * @returns {HtmlElement|false} The matched element or false if did not match
         * @sample Ink_Dom_Element_1_findUpwardsById.html 
         */
        findUpwardsById: function(element, id) {
            var tst = function(el) {
                return el.id === id;
            };
            return InkElement.findUpwardsHaving(element, tst);
        },

        /**
         * Finds the closest ancestor by CSS selector
         *
         * @method findUpwardsBySelector
         * @param {HtmlElement} element     Element to base the search from
         * @param {String}      sel         CSS selector
         * @returns {HtmlElement|false} The matched element or false if did not match
         * @sample Ink_Dom_Element_1_findUpwardsBySelector.html 
         */
        findUpwardsBySelector: function(element, sel) {
            var Selector = Ink.getModule('Ink.Dom.Selector', '1');
            if (!Selector) {
                throw new Error('This method requires Ink.Dom.Selector');
            }
            var tst = function(el) {
                return Selector.matchesSelector(el, sel);
            };
            return InkElement.findUpwardsHaving(element, tst);
        },

        /**
         * Gets the trimmed text of an element
         *
         * @method getChildrenText
         * @param {DOMElement}  el          Element to base the search from
         * @param {Boolean}     [removeIt]  Flag to remove the text from the element
         * @return {String} Text found
         * @sample Ink_Dom_Element_1_getChildrenText.html 
         */
        getChildrenText: function(el, removeIt) {
            var node,
                j,
                part,
                nodes = el.childNodes,
                jLen = nodes.length,
                text = '';

            if (!el) {
                return text;
            }

            for (j = 0; j < jLen; ++j) {
                node = nodes[j];
                if (!node) {    continue;   }
                if (node.nodeType === 3) {  // TEXT NODE
                    part = InkElement._trimString( String(node.data) );
                    if (part.length > 0) {
                        text += part;
                        if (removeIt) { el.removeChild(node);   }
                    }
                    else {  el.removeChild(node);   }
                }
            }

            return text;
        },

        /**
         * String trim implementation
         * Used by getChildrenText
         *
         * function _trimString
         * param {String} text
         * return {String} trimmed text
         */
        _trimString: function(text) {
            return (String.prototype.trim) ? text.trim() : text.replace(/^\s*/, '').replace(/\s*$/, '');
        },

        /**
         * Gets value of a select element
         *
         * @method getSelectValues
         * @param {DOMElement|String} select element
         * @return {Array} The selected values
         * @sample Ink_Dom_Element_1_getSelectValues.html 
         */
        getSelectValues: function (select) {
            var selectEl = Ink.i(select);
            var values = [];
            for (var i = 0; i < selectEl.options.length; ++i) {
                values.push( selectEl.options[i].value );
            }
            return values;
        },


        /* used by fills */
        _normalizeData: function(data) {
            var d, data2 = [];
            for (var i = 0, f = data.length; i < f; ++i) {
                d = data[i];

                if (!(d instanceof Array)) {    // if not array, wraps primitive twice:     val -> [val, val]
                    d = [d, d];
                }
                else if (d.length === 1) {      // if 1 element array:                      [val] -> [val, val]
                    d.push(d[0]);
                }
                data2.push(d);
            }
            return data2;
        },


        /**
         * Fills a select element with options
         *
         * @method fillSelect
         * @param {DOMElement|String}  container       Select element which will get filled
         * @param {Array}              data            Data to populate the component
         * @param {Boolean}            [skipEmpty]     Flag to skip empty option
         * @param {String|Number}      [defaultValue]  Initial selected value
         *
         * @sample Ink_Dom_Element_1_fillSelect.html 
         */
        fillSelect: function(container, data, skipEmpty, defaultValue) {
            var containerEl = Ink.i(container);
            if (!containerEl) {   return; }

            containerEl.innerHTML = '';
            var d, optionEl;

            if (!skipEmpty) {
                // add initial empty option
                optionEl = document.createElement('option');
                optionEl.setAttribute('value', '');
                containerEl.appendChild(optionEl);
            }

            data = InkElement._normalizeData(data);

            for (var i = 0, f = data.length; i < f; ++i) {
                d = data[i];

                optionEl = document.createElement('option');
                optionEl.setAttribute('value', d[0]);
                if (d.length > 2) {
                    optionEl.setAttribute('extra', d[2]);
                }
                optionEl.appendChild( document.createTextNode(d[1]) );

                if (d[0] === defaultValue) {
                    optionEl.setAttribute('selected', 'selected');
                }

                containerEl.appendChild(optionEl);
            }
        },


        /**
         * Creates a set of radio buttons from an array of data
         *
         * @method fillRadios
         * @param {DOMElement|String}  insertAfterEl    Element after which the input elements will be created
         * @param {String}             name             Name for the form field ([] is added if not present as a suffix)
         * @param {Array}              data             Data to populate the component
         * @param {Boolean}            [skipEmpty]      Flag to skip creation of empty options
         * @param {String|Number}      [defaultValue]   Initial selected value
         * @param {String}             [splitEl]        Name of element to add after each input element (example: 'br')
         * @return {DOMElement} Wrapper element around the radio buttons
         */
        fillRadios: function(insertAfterEl, name, data, skipEmpty, defaultValue, splitEl) {
            insertAfterEl = Ink.i(insertAfterEl);
            var containerEl = document.createElement('span');
            InkElement.insertAfter(containerEl, insertAfterEl);

            data = InkElement._normalizeData(data);

            /*
            if (name.substring(name.length - 1) !== ']') {
                name += '[]';
            }
            */

            var d, inputEl;

            if (!skipEmpty) {
                // add initial empty option
                inputEl = document.createElement('input');
                inputEl.setAttribute('type', 'radio');
                inputEl.setAttribute('name', name);
                inputEl.setAttribute('value', '');
                containerEl.appendChild(inputEl);
                if (splitEl) {  containerEl.appendChild( document.createElement(splitEl) ); }
            }

            for (var i = 0; i < data.length; ++i) {
                d = data[i];

                inputEl = document.createElement('input');
                inputEl.setAttribute('type', 'radio');
                inputEl.setAttribute('name', name);
                inputEl.setAttribute('value', d[0]);
                containerEl.appendChild(inputEl);
                containerEl.appendChild( document.createTextNode(d[1]) );
                if (splitEl) {  containerEl.appendChild( document.createElement(splitEl) ); }

                if (d[0] === defaultValue) {
                    inputEl.checked = true;
                }
            }

            return containerEl;
        },


        /**
         * Creates set of checkbox buttons
         *
         * @method fillChecks
         * @param {DOMElement|String}  insertAfterEl   Element after which the input elements will be created
         * @param {String}             name            Name for the form field ([] is added if not present as a suffix)
         * @param {Array}              data            Data to populate the component
         * @param {Boolean}            [skipEmpty]     Flag to skip creation of empty options
         * @param {String|Number}      [defaultValue]  Initial selected value
         * @param {String}             [splitEl]       Name of element to add after each input element (example: 'br')
         * @return {DOMElement} Wrapper element around the checkboxes
         */
        fillChecks: function(insertAfterEl, name, data, defaultValue, splitEl) {
            insertAfterEl = Ink.i(insertAfterEl);
            var containerEl = document.createElement('span');
            InkElement.insertAfter(containerEl, insertAfterEl);

            data = InkElement._normalizeData(data);

            if (name.substring(name.length - 1) !== ']') {
                name += '[]';
            }

            var d, inputEl;

            for (var i = 0; i < data.length; ++i) {
                d = data[i];

                inputEl = document.createElement('input');
                inputEl.setAttribute('type', 'checkbox');
                inputEl.setAttribute('name', name);
                inputEl.setAttribute('value', d[0]);
                containerEl.appendChild(inputEl);
                containerEl.appendChild( document.createTextNode(d[1]) );
                if (splitEl) {  containerEl.appendChild( document.createElement(splitEl) ); }

                if (d[0] === defaultValue) {
                    inputEl.checked = true;
                }
            }

            return containerEl;
        },


        /**
         * Gets the index of an element relative to a parent
         *
         * @method parentIndexOf
         * @param {DOMElement}  parentEl  Element to parse
         * @param {DOMElement}  childEl   Child Element to look for
         * @return {Number} The index of the childEl inside parentEl. Returns -1 if it's not a direct child
         * @sample Ink_Dom_Element_1_parentIndexOf.html 
         */
        parentIndexOf: function(parentEl, childEl) {
            var node, idx = 0;
            for (var i = 0, f = parentEl.childNodes.length; i < f; ++i) {
                node = parentEl.childNodes[i];
                if (node.nodeType === 1) {  // ELEMENT
                    if (node === childEl) { return idx; }
                    ++idx;
                }
            }
            return -1;
        },


        /**
         * Gets the next siblings of an element
         *
         * @method nextSiblings
         * @param {String|DOMElement} elm Element
         * @return {Array} Array of next sibling elements
         * @sample Ink_Dom_Element_1_nextSiblings.html 
         */
        nextSiblings: function(elm) {
            elm = Ink.i(elm);
            if(typeof(elm) === 'object' && elm !== null && elm.nodeType && elm.nodeType === 1) {
                var elements = [],
                    siblings = elm.parentNode.children,
                    index    = InkElement.parentIndexOf(elm.parentNode, elm);

                for(var i = ++index, len = siblings.length; i<len; i++) {
                    elements.push(siblings[i]);
                }

                return elements;
            }
            return [];
        },


        /**
         * Gets the previous siblings of an element
         *
         * @method previousSiblings
         * @param {String|DOMElement} elm Element
         * @return {Array} Array of previous sibling elements
         * @sample Ink_Dom_Element_1_previousSiblings.html 
         */
        previousSiblings: function(elm) {
            elm = Ink.i(elm);
            if(typeof(elm) === 'object' && elm !== null && elm.nodeType && elm.nodeType === 1) {
                var elements    = [],
                    siblings    = elm.parentNode.children,
                    index       = InkElement.parentIndexOf(elm.parentNode, elm);

                for(var i = 0, len = index; i<len; i++) {
                    elements.push(siblings[i]);
                }

                return elements;
            }
            return [];
        },


        /**
         * Gets the all siblings of an element
         *
         * @method siblings
         * @param {String|DOMElement} elm Element
         * @return {Array} Array of sibling elements
         * @sample Ink_Dom_Element_1_siblings.html 
         */
        siblings: function(elm) {
            elm = Ink.i(elm);
            if(typeof(elm) === 'object' && elm !== null && elm.nodeType && elm.nodeType === 1) {
                var elements   = [],
                    siblings   = elm.parentNode.children;

                for(var i = 0, len = siblings.length; i<len; i++) {
                    if(elm !== siblings[i]) {
                        elements.push(siblings[i]);
                    }
                }

                return elements;
            }
            return [];
        },

        /**
         * Counts the number of children of an element
         *
         * @method childElementCount
         * @param {String|DOMElement} elm element
         * @return {Number} number of child elements
         * @sample Ink_Dom_Element_1_childElementCount.html 
         */
        childElementCount: function(elm) {
            elm = Ink.i(elm);
            if ('childElementCount' in elm) {
                return elm.childElementCount;
            }
            if (!elm) { return 0; }
            return InkElement.siblings(elm).length + 1;
        },

        _wrapElements: {
            TABLE: function (div, html) {
                /* If we don't create a tbody, IE7 does that for us. Adding a tbody with a random string and then filtering for that random string is the only way to avoid double insertion of tbodies. */
                if (browserCreatesTbodies) {
                    div.innerHTML = "<table>" + html + "<tbody><tr><td>" + deleteThisTbodyToken + "</tr></td></tbody></table>";
                } else {
                    div.innerHTML = "<table>" + html + "</table>";
                }
                return div.firstChild;
            },
            TBODY: function (div, html) {
                div.innerHTML = '<table><tbody>' + html + '</tbody></table>';
                return div.firstChild.getElementsByTagName('tbody')[0];
            },
            THEAD: function (div, html) {
                div.innerHTML = '<table><thead>' + html + '</thead><tbody></tbody></table>';
                return div.firstChild.getElementsByTagName('thead')[0];
            },
            TFOOT: function (div, html) {
                div.innerHTML = '<table><tfoot>' + html + '</tfoot><tbody></tbody></table>';
                return div.firstChild.getElementsByTagName('tfoot')[0];
            },
            TR: function (div, html) {
                div.innerHTML = '<table><tbody><tr>' + html + '</tr></tbody></table>';
                return div.firstChild.firstChild.firstChild;
            }
        },

        /**
         * Gets a wrapper DIV with a certain HTML content to be inserted inside another element.
         * This is necessary for appendHTML,prependHTML functions, because they need a container element to copy the children from.
         *
         * Works around IE table quirks
         * @method _getWrapper
         * @private
         * @param elm
         * @param html
         */
        _getWrapper: function (elm, html) {
            var nodeName = elm.nodeName && elm.nodeName.toUpperCase();
            var wrapper = document.createElement('div');
            var wrapFunc = InkElement._wrapElements[nodeName];

            if ( !wrapFunc ) {
                wrapper.innerHTML = html;
                return wrapper;
            }
            // special cases
            wrapper = wrapFunc(wrapper, html);
            // worst case: tbody auto-creation even when our HTML has a tbody.
            if (browserCreatesTbodies && nodeName === 'TABLE') {
                // terrible case. Deal with tbody creation too.
                var tds = wrapper.getElementsByTagName('td');
                for (var i = 0, len = tds.length; i < len; i++) {
                    if (tds[i].innerHTML === deleteThisTbodyToken) {
                        var tbody = tds[i].parentNode.parentNode;
                        tbody.parentNode.removeChild(tbody);
                    }
                }
            }
            return wrapper;
        },

        /**
         * Appends HTML to an element.
         * This method parses the html string and doesn't modify its contents
         *
         * @method appendHTML
         * @param {String|DOMElement} elm   Element
         * @param {String}            html  Markup string
         * @sample Ink_Dom_Element_1_appendHTML.html 
         */
        appendHTML: function(elm, html){
            elm = Ink.i(elm);
            if(elm !== null) {
                var wrapper = InkElement._getWrapper(elm, html);
                while (wrapper.firstChild) {
                    elm.appendChild(wrapper.firstChild);
                }
            }
        },

        /**
         * Prepends HTML to an element.
         * This method parses the html string and doesn't modify its contents
         *
         * @method prependHTML
         * @param {String|DOMElement} elm   Element
         * @param {String}            html  Markup string
         * @sample Ink_Dom_Element_1_prependHTML.html 
         */
        prependHTML: function(elm, html){
            elm = Ink.i(elm);
            if(elm !== null) {
                var wrapper = InkElement._getWrapper(elm, html);
                while (wrapper.lastChild) {
                    elm.insertBefore(wrapper.lastChild, elm.firstChild);
                }
            }
        },

        /**
         * Sets the inner HTML of an element.
         *
         * @method setHTML
         * @param {String|DOMElement} elm   Element
         * @param {String}            html  Markup string
         * @sample Ink_Dom_Element_1_setHTML.html 
         */
        setHTML: function (elm, html) {
            elm = Ink.i(elm);
            if(elm !== null) {
                try {
                    elm.innerHTML = html;
                } catch (e) {
                    // Tables in IE7
                    while (elm.firstChild) {
                        elm.removeChild(elm.firstChild);
                    }
                    InkElement.appendHTML(elm, html);
                }
            }
        },

        /**
         * Wraps an element inside a container.
         *
         * The container may or may not be in the document yet.
         *
         * @method wrap
         * @param {String|DOMElement}   target      Element to be wrapped
         * @param {String|DOMElement}   container   Element to wrap the target
         * @return Container element
         * @sample Ink_Dom_Element_1_wrap.html 
         *
         * @example
         * before:
         *
         *     <div id="target"></div>
         *
         * call this function to wrap #target with a wrapper div.
         *
         *     InkElement.wrap('target', InkElement.create('div', {id: 'container'});
         * 
         * after: 
         *
         *     <div id="container"><div id="target"></div></div>
         */
        wrap: function (target, container) {
            target = Ink.i(target);
            container = Ink.i(container);
            
            var nextNode = target.nextSibling;
            var parent = target.parentNode;

            container.appendChild(target);

            if (nextNode !== null) {
                parent.insertBefore(container, nextNode);
            } else {
                parent.appendChild(container);
            }

            return container;
        },

        /**
         * Places an element outside a wrapper.
         *
         * @method unwrap
         * @param {DOMElement}  elem                The element you're trying to unwrap. This should be an ancestor of the wrapper.
         * @param {String}      [wrapperSelector]   CSS Selector for the ancestor. Use this if your wrapper is not the direct parent of elem.
         * @sample Ink_Dom_Element_1_unwrap.html 
         *
         * @example
         *
         * When you have this:
         *
         *      <div id="wrapper">
         *          <div id="unwrapMe"></div>
         *      </div>
         *
         * If you do this:
         *
         *      InkElement.unwrap('unwrapMe');
         *
         * You get this:
         *
         *      <div id="unwrapMe"></div>
         *      <div id="wrapper"></div>
         *      
         **/
        unwrap: function (elem, wrapperSelector) {
            elem = Ink.i(elem);
            var wrapper;
            if (typeof wrapperSelector === 'string') {
                wrapper = InkElement.findUpwardsBySelector(elem, wrapperSelector);
            } else if (typeof wrapperSelector === 'object' && wrapperSelector.tagName) {
                wrapper = InkElement.findUpwardsHaving(elem, function (ancestor) {
                    return ancestor === wrapperSelector;
                });
            } else {
                wrapper = elem.parentNode;
            }
            if (!wrapper || !wrapper.parentNode) { return; }

            InkElement.insertBefore(elem, wrapper);
        },

        /**
         * Replaces an element with another.
         *
         * @method replace
         * @param element       The element to be replaced.
         * @param replacement   The new element.
         * @sample Ink_Dom_Element_1_replace.html 
         *
         * @example
         *       var newelement1 = InkElement.create('div');
         *       // ...
         *       replace(Ink.i('element1'), newelement1);
         */
        replace: function (element, replacement) {
            element = Ink.i(element);
            if(element !== null) {
                element.parentNode.replaceChild(replacement, element);
            }
        },

        /**
         * Removes direct text children.
         * Useful to remove nasty layout gaps generated by whitespace on the markup.
         *
         * @method removeTextNodeChildren
         * @param  {DOMElement} el          Element to remove text from
         * @sample Ink_Dom_Element_1_removeTextNodeChildren.html 
         */
        removeTextNodeChildren: function(el) {
            el = Ink.i(el);
            if(el !== null) {
                var prevEl, toRemove, parent = el;
                el = el.firstChild;
                while (el) {
                    toRemove = (el.nodeType === 3);
                    prevEl = el;
                    el = el.nextSibling;
                    if (toRemove) {
                        parent.removeChild(prevEl);
                    }
                }
            }
        },

        /**
         * Creates a documentFragment from an HTML string.
         *
         * @method htmlToFragment
         * @param  {String} html  HTML string
         * @return {DocumentFragment} DocumentFragment containing all of the elements from the html string
         * @sample Ink_Dom_Element_1_htmlToFragment.html 
         */
        htmlToFragment: (createContextualFragmentSupport ?
            function(html){
                var range;

                if(typeof html !== 'string'){ return document.createDocumentFragment(); }

                range = document.createRange();

                // set the context to document.body (firefox does this already, webkit doesn't)
                range.selectNode(document.body);

                return range.createContextualFragment(html);
            } : function (html) {
                var fragment = document.createDocumentFragment(),
                    tempElement,
                    current;

                if(typeof html !== 'string'){ return fragment; }

                tempElement = document.createElement('div');
                tempElement.innerHTML = html;

                // append child removes elements from the original parent
                while( (current = tempElement.firstChild) ){ // intentional assignment
                    fragment.appendChild(current);
                }

                return fragment;
            }),

        _camelCase: function(str)
        {
            return str ? str.replace(/-(\w)/g, function (_, $1){
                return $1.toUpperCase();
            }) : str;
        },

        /**
         * Gets data attributes from an element
         *
         * @method data
         * @param {String|DOMElement} selector Element or CSS selector
         * @return {Object} Object with the data-* properties. If no data-attributes are present, an empty object is returned.
         * @sample Ink_Dom_Element_1_data.html 
        */
        data: function(selector) {
            var el;
            if (typeof selector !== 'object' && typeof selector !== 'string') {
                throw '[Ink.Dom.Element.data] :: Invalid selector defined';
            }

            if (typeof selector === 'object') {
                el = selector;
            }
            else {
                var InkDomSelector = Ink.getModule('Ink.Dom.Selector', 1);
                if (!InkDomSelector) {
                    throw "[Ink.Dom.Element.data] :: this method requires Ink.Dom.Selector - v1";
                }
                el = InkDomSelector.select(selector);
                if (el.length <= 0) {
                    throw "[Ink.Dom.Element.data] :: Can't find any element with the specified selector";
                }
                el = el[0];
            }

            var dataset = {};
            var attrs = el.attributes || [];

            var curAttr, curAttrName, curAttrValue;
            if (attrs) {
                for (var i = 0, total = attrs.length; i < total; ++i) {
                    curAttr = attrs[i];
                    curAttrName = curAttr.name;
                    curAttrValue = curAttr.value;
                    if (curAttrName && curAttrName.indexOf('data-') === 0) {
                        dataset[InkElement._camelCase(curAttrName.replace('data-', ''))] = curAttrValue;
                    }
                }
            }

            return dataset;
        },

        /**
         * Move the cursor on an input or textarea element.
         * @method moveCursorTo
         * @param  {DOMElement} el  Input or Textarea element
         * @param  {Number}     t   Index of the character to move the cursor to
         * @sample Ink_Dom_Element_1_moveCursorTo.html 
         */
        moveCursorTo: function(el, t) {
            el = Ink.i(el);
            if(el !== null) {
                if (el.setSelectionRange) {
                    el.setSelectionRange(t, t);
                    //el.focus();
                }
                else {
                    var range = el.createTextRange();
                    range.collapse(true);
                    range.moveEnd(  'character', t);
                    range.moveStart('character', t);
                    range.select();
                }
            }
        },

        /**
         * Get the page's width.
         * @method pageWidth
         * @return {Number} Page width in pixels
         * @sample Ink_Dom_Element_1_pageWidth.html 
         */
        pageWidth: function() {
            var xScroll;

            if (window.innerWidth && window.scrollMaxX) {
                xScroll = window.innerWidth + window.scrollMaxX;
            } else if (document.body.scrollWidth > document.body.offsetWidth){
                xScroll = document.body.scrollWidth;
            } else {
                xScroll = document.body.offsetWidth;
            }

            var windowWidth;

            if (window.self.innerWidth) {
                if(document.documentElement.clientWidth){
                    windowWidth = document.documentElement.clientWidth;
                } else {
                    windowWidth = window.self.innerWidth;
                }
            } else if (document.documentElement && document.documentElement.clientWidth) {
                windowWidth = document.documentElement.clientWidth;
            } else if (document.body) {
                windowWidth = document.body.clientWidth;
            }

            if(xScroll < windowWidth){
                return xScroll;
            } else {
                return windowWidth;
            }
        },

        /**
         * Get the page's height.
         * @method pageHeight
         * @return {Number} Page height in pixels
         * @sample Ink_Dom_Element_1_pageHeight.html 
         */
        pageHeight: function() {
            var yScroll;

            if (window.innerHeight && window.scrollMaxY) {
                yScroll = window.innerHeight + window.scrollMaxY;
            } else if (document.body.scrollHeight > document.body.offsetHeight){
                yScroll = document.body.scrollHeight;
            } else {
                yScroll = document.body.offsetHeight;
            }

            var windowHeight;

            if (window.self.innerHeight) {
                windowHeight = window.self.innerHeight;
            } else if (document.documentElement && document.documentElement.clientHeight) {
                windowHeight = document.documentElement.clientHeight;
            } else if (document.body) {
                windowHeight = document.body.clientHeight;
            }

            if(yScroll < windowHeight){
                return windowHeight;
            } else {
                return yScroll;
            }
        },

       /**
         * Get the viewport's width.
         * @method viewportWidth
         * @return {Number} Viewport width in pixels
         * @sample Ink_Dom_Element_1_viewportWidth.html 
         */
        viewportWidth: function() {
            if(typeof window.innerWidth !== "undefined") {
                return window.innerWidth;
            }
            if (document.documentElement && typeof document.documentElement.offsetWidth !== "undefined") {
                return document.documentElement.offsetWidth;
            }
        },

        /**
         * Get the viewport's height.
         * @method viewportHeight
         * @return {Number} Viewport height in pixels
         * @sample Ink_Dom_Element_1_viewportHeight.html 
         */
        viewportHeight: function() {
            if (typeof window.innerHeight !== "undefined") {
                return window.innerHeight;
            }
            if (document.documentElement && typeof document.documentElement.offsetHeight !== "undefined") {
                return document.documentElement.offsetHeight;
            }
        },

        /**
         * Get the scroll's width.
         * @method scrollWidth
         * @return {Number} Scroll width
         */
        scrollWidth: function() {
            if (typeof window.self.pageXOffset !== 'undefined') {
                return window.self.pageXOffset;
            }
            if (typeof document.documentElement !== 'undefined' && typeof document.documentElement.scrollLeft !== 'undefined') {
                return document.documentElement.scrollLeft;
            }
            return document.body.scrollLeft;
        },

        /**
         * Get the scroll's height.
         * @method scrollHeight
         * @return {Number} Scroll height
         */
        scrollHeight: function() {
            if (typeof window.self.pageYOffset !== 'undefined') {
                return window.self.pageYOffset;
            }
            if (typeof document.documentElement !== 'undefined' && typeof document.documentElement.scrollTop !== 'undefined') {
                return document.documentElement.scrollTop;
            }
            return document.body.scrollTop;
        }
    };

    return InkElement;

});

/**
 * Event management
 * @module Ink.Dom.Event_1
 * @version 1
 */

Ink.createModule('Ink.Dom.Event', 1, [], function() {
    /* jshint
           asi:true,
           strict:false,
           laxcomma:true,
           eqeqeq:false,
           laxbreak:true,
           boss:true,
           curly:false,
           expr:true
           */

    /**
     * @namespace Ink.Dom.Event_1
     * @static
     */

    /*!
      * Bean - copyright (c) Jacob Thornton 2011-2012
      * https://github.com/fat/bean
      * MIT license
      */
    var bean = (function (name, context, definition) {
      return definition()
    })('bean', this, function (name, context) {
      name    = name    || 'bean'
      context = context || this

      var win            = window
        , old            = context[name]
        , namespaceRegex = /[^\.]*(?=\..*)\.|.*/
        , nameRegex      = /\..*/
        , addEvent       = 'addEventListener'
        , removeEvent    = 'removeEventListener'
        , doc            = document || {}
        , root           = doc.documentElement || {}
        , W3C_MODEL      = root[addEvent]
        , eventSupport   = W3C_MODEL ? addEvent : 'attachEvent'
        , ONE            = {} // singleton for quick matching making add() do one()

        , slice          = Array.prototype.slice
        , str2arr        = function (s, d) { return s.split(d || ' ') }
        , isString       = function (o) { return typeof o == 'string' }
        , isFunction     = function (o) { return typeof o == 'function' }

          // events that we consider to be 'native', anything not in this list will
          // be treated as a custom event
        , standardNativeEvents =
            'click dblclick mouseup mousedown contextmenu '                  + // mouse buttons
            'mousewheel mousemultiwheel DOMMouseScroll '                     + // mouse wheel
            'mouseover mouseout mousemove selectstart selectend '            + // mouse movement
            'keydown keypress keyup '                                        + // keyboard
            'orientationchange '                                             + // mobile
            'focus blur change reset select submit '                         + // form elements
            'load unload beforeunload resize move DOMContentLoaded '         + // window
            'readystatechange message '                                      + // window
            'error abort scroll '                                              // misc
          // element.fireEvent('onXYZ'... is not forgiving if we try to fire an event
          // that doesn't actually exist, so make sure we only do these on newer browsers
        , w3cNativeEvents =
            'show '                                                          + // mouse buttons
            'input invalid '                                                 + // form elements
            'touchstart touchmove touchend touchcancel '                     + // touch
            'gesturestart gesturechange gestureend '                         + // gesture
            'textinput'                                                      + // TextEvent
            'readystatechange pageshow pagehide popstate '                   + // window
            'hashchange offline online '                                     + // window
            'afterprint beforeprint '                                        + // printing
            'dragstart dragenter dragover dragleave drag drop dragend '      + // dnd
            'loadstart progress suspend emptied stalled loadmetadata '       + // media
            'loadeddata canplay canplaythrough playing waiting seeking '     + // media
            'seeked ended durationchange timeupdate play pause ratechange '  + // media
            'volumechange cuechange '                                        + // media
            'checking noupdate downloading cached updateready obsolete '       // appcache

          // convert to a hash for quick lookups
        , nativeEvents = (function (hash, events, i) {
            for (i = 0; i < events.length; i++) events[i] && (hash[events[i]] = 1)
            return hash
          }({}, str2arr(standardNativeEvents + (W3C_MODEL ? w3cNativeEvents : ''))))

          // custom events are events that we *fake*, they are not provided natively but
          // we can use native events to generate them
        , customEvents = (function () {
            var isAncestor = 'compareDocumentPosition' in root
                  ? function (element, container) {
                      return container.compareDocumentPosition && (container.compareDocumentPosition(element) & 16) === 16
                    }
                  : 'contains' in root
                    ? function (element, container) {
                        container = container.nodeType === 9 || container === window ? root : container
                        return container !== element && container.contains(element)
                      }
                    : function (element, container) {
                        while (element = element.parentNode) if (element === container) return 1
                        return 0
                      }
              , check = function (event) {
                  var related = event.relatedTarget
                  return !related
                    ? related == null
                    : (related !== this && related.prefix !== 'xul' && !/document/.test(this.toString())
                        && !isAncestor(related, this))
                }

            return {
                mouseenter: { base: 'mouseover', condition: check }
              , mouseleave: { base: 'mouseout', condition: check }
              , mousewheel: { base: /Firefox/.test(navigator.userAgent) ? 'DOMMouseScroll' : 'mousewheel' }
            }
          }())

          // we provide a consistent Event object across browsers by taking the actual DOM
          // event object and generating a new one from its properties.
        , Event = (function () {
                // a whitelist of properties (for different event types) tells us what to check for and copy
            var commonProps  = str2arr('altKey attrChange attrName bubbles cancelable ctrlKey currentTarget ' +
                  'detail eventPhase getModifierState isTrusted metaKey relatedNode relatedTarget shiftKey '  +
                  'srcElement target timeStamp type view which propertyName')
              , mouseProps   = commonProps.concat(str2arr('button buttons clientX clientY dataTransfer '      +
                  'fromElement offsetX offsetY pageX pageY screenX screenY toElement'))
              , mouseWheelProps = mouseProps.concat(str2arr('wheelDelta wheelDeltaX wheelDeltaY wheelDeltaZ ' +
                  'axis')) // 'axis' is FF specific
              , keyProps     = commonProps.concat(str2arr('char charCode key keyCode keyIdentifier '          +
                  'keyLocation location'))
              , textProps    = commonProps.concat(str2arr('data'))
              , touchProps   = commonProps.concat(str2arr('touches targetTouches changedTouches scale rotation'))
              , messageProps = commonProps.concat(str2arr('data origin source'))
              , stateProps   = commonProps.concat(str2arr('state'))
              , overOutRegex = /over|out/
                // some event types need special handling and some need special properties, do that all here
              , typeFixers   = [
                    { // key events
                        reg: /key/i
                      , fix: function (event, newEvent) {
                          newEvent.keyCode = event.keyCode || event.which
                          return keyProps
                        }
                    }
                  , { // mouse events
                        reg: /click|mouse(?!(.*wheel|scroll))|menu|drag|drop/i
                      , fix: function (event, newEvent, type) {
                          newEvent.rightClick = event.which === 3 || event.button === 2
                          newEvent.pos = { x: 0, y: 0 }
                          if (event.pageX || event.pageY) {
                            newEvent.clientX = event.pageX
                            newEvent.clientY = event.pageY
                          } else if (event.clientX || event.clientY) {
                            newEvent.clientX = event.clientX + doc.body.scrollLeft + root.scrollLeft
                            newEvent.clientY = event.clientY + doc.body.scrollTop + root.scrollTop
                          }
                          if (overOutRegex.test(type)) {
                            newEvent.relatedTarget = event.relatedTarget
                              || event[(type == 'mouseover' ? 'from' : 'to') + 'Element']
                          }
                          return mouseProps
                        }
                    }
                  , { // mouse wheel events
                        reg: /mouse.*(wheel|scroll)/i
                      , fix: function () { return mouseWheelProps }
                    }
                  , { // TextEvent
                        reg: /^text/i
                      , fix: function () { return textProps }
                    }
                  , { // touch and gesture events
                        reg: /^touch|^gesture/i
                      , fix: function () { return touchProps }
                    }
                  , { // message events
                        reg: /^message$/i
                      , fix: function () { return messageProps }
                    }
                  , { // popstate events
                        reg: /^popstate$/i
                      , fix: function () { return stateProps }
                    }
                  , { // everything else
                        reg: /.*/
                      , fix: function () { return commonProps }
                    }
                ]
              , typeFixerMap = {} // used to map event types to fixer functions (above), a basic cache mechanism

              , Event = function (event, element, isNative) {
                  if (!arguments.length) return
                  event = event || ((element.ownerDocument || element.document || element).parentWindow || win).event
                  this.originalEvent = event
                  this.isNative       = isNative
                  this.isBean         = true

                  if (!event) return

                  var type   = event.type
                    , target = event.target || event.srcElement
                    , i, l, p, props, fixer

                  this.target = target && target.nodeType === 3 ? target.parentNode : target

                  if (isNative) { // we only need basic augmentation on custom events, the rest expensive & pointless
                    fixer = typeFixerMap[type]
                    if (!fixer) { // haven't encountered this event type before, map a fixer function for it
                      for (i = 0, l = typeFixers.length; i < l; i++) {
                        if (typeFixers[i].reg.test(type)) { // guaranteed to match at least one, last is .*
                          typeFixerMap[type] = fixer = typeFixers[i].fix
                          break
                        }
                      }
                    }

                    props = fixer(event, this, type)
                    for (i = props.length; i--;) {
                      if (!((p = props[i]) in this) && p in event) this[p] = event[p]
                    }
                  }
                }

            // preventDefault() and stopPropagation() are a consistent interface to those functions
            // on the DOM, stop() is an alias for both of them together
            Event.prototype.preventDefault = function () {
              if (this.originalEvent.preventDefault) this.originalEvent.preventDefault()
              else this.originalEvent.returnValue = false
            }
            Event.prototype.stopPropagation = function () {
              if (this.originalEvent.stopPropagation) this.originalEvent.stopPropagation()
              else this.originalEvent.cancelBubble = true
            }
            Event.prototype.stop = function () {
              this.preventDefault()
              this.stopPropagation()
              this.stopped = true
            }
            // stopImmediatePropagation() has to be handled internally because we manage the event list for
            // each element
            // note that originalElement may be a Bean#Event object in some situations
            Event.prototype.stopImmediatePropagation = function () {
              if (this.originalEvent.stopImmediatePropagation) this.originalEvent.stopImmediatePropagation()
              this.isImmediatePropagationStopped = function () { return true }
            }
            Event.prototype.isImmediatePropagationStopped = function () {
              return this.originalEvent.isImmediatePropagationStopped && this.originalEvent.isImmediatePropagationStopped()
            }
            Event.prototype.clone = function (currentTarget) {
              //TODO: this is ripe for optimisation, new events are *expensive*
              // improving this will speed up delegated events
              var ne = new Event(this, this.element, this.isNative)
              ne.currentTarget = currentTarget
              return ne
            }

            return Event
          }())

          // if we're in old IE we can't do onpropertychange on doc or win so we use doc.documentElement for both
        , targetElement = function (element, isNative) {
            return !W3C_MODEL && !isNative && (element === doc || element === win) ? root : element
          }

          /**
            * Bean maintains an internal registry for event listeners. We don't touch elements, objects
            * or functions to identify them, instead we store everything in the registry.
            * Each event listener has a RegEntry object, we have one 'registry' for the whole instance.
            */
        , RegEntry = (function () {
            // each handler is wrapped so we can handle delegation and custom events
            var wrappedHandler = function (element, fn, condition, args) {
                var call = function (event, eargs) {
                      return fn.apply(element, args ? slice.call(eargs, event ? 0 : 1).concat(args) : eargs)
                    }
                  , findTarget = function (event, eventElement) {
                      return fn.__beanDel ? fn.__beanDel.ft(event.target, element) : eventElement
                    }
                  , handler = condition
                      ? function (event) {
                          var target = findTarget(event, this) // deleated event
                          if (condition.apply(target, arguments)) {
                            if (event) event.currentTarget = target
                            return call(event, arguments)
                          }
                        }
                      : function (event) {
                          if (fn.__beanDel) event = event.clone(findTarget(event)) // delegated event, fix the fix
                          return call(event, arguments)
                        }
                handler.__beanDel = fn.__beanDel
                return handler
              }

            , RegEntry = function (element, type, handler, original, namespaces, args, root) {
                var customType     = customEvents[type]
                  , isNative

                if (type == 'unload') {
                  // self clean-up
                  handler = once(removeListener, element, type, handler, original)
                }

                if (customType) {
                  if (customType.condition) {
                    handler = wrappedHandler(element, handler, customType.condition, args)
                  }
                  type = customType.base || type
                }

                this.isNative      = isNative = nativeEvents[type] && !!element[eventSupport]
                this.customType    = !W3C_MODEL && !isNative && type
                this.element       = element
                this.type          = type
                this.original      = original
                this.namespaces    = namespaces
                this.eventType     = W3C_MODEL || isNative ? type : 'propertychange'
                this.target        = targetElement(element, isNative)
                this[eventSupport] = !!this.target[eventSupport]
                this.root          = root
                this.handler       = wrappedHandler(element, handler, null, args)
              }

            // given a list of namespaces, is our entry in any of them?
            RegEntry.prototype.inNamespaces = function (checkNamespaces) {
              var i, j, c = 0
              if (!checkNamespaces) return true
              if (!this.namespaces) return false
              for (i = checkNamespaces.length; i--;) {
                for (j = this.namespaces.length; j--;) {
                  if (checkNamespaces[i] == this.namespaces[j]) c++
                }
              }
              return checkNamespaces.length === c
            }

            // match by element, original fn (opt), handler fn (opt)
            RegEntry.prototype.matches = function (checkElement, checkOriginal, checkHandler) {
              return this.element === checkElement &&
                (!checkOriginal || this.original === checkOriginal) &&
                (!checkHandler || this.handler === checkHandler)
            }

            return RegEntry
          }())

        , registry = (function () {
            // our map stores arrays by event type, just because it's better than storing
            // everything in a single array.
            // uses '$' as a prefix for the keys for safety and 'r' as a special prefix for
            // rootListeners so we can look them up fast
            var map = {}

              // generic functional search of our registry for matching listeners,
              // `fn` returns false to break out of the loop
              , forAll = function (element, type, original, handler, root, fn) {
                  var pfx = root ? 'r' : '$'
                  if (!type || type == '*') {
                    // search the whole registry
                    for (var t in map) {
                      if (t.charAt(0) == pfx) {
                        forAll(element, t.substr(1), original, handler, root, fn)
                      }
                    }
                  } else {
                    var i = 0, l, list = map[pfx + type], all = element == '*'
                    if (!list) return
                    for (l = list.length; i < l; i++) {
                      if ((all || list[i].matches(element, original, handler)) && !fn(list[i], list, i, type)) return
                    }
                  }
                }

              , has = function (element, type, original, root) {
                  // we're not using forAll here simply because it's a bit slower and this
                  // needs to be fast
                  var i, list = map[(root ? 'r' : '$') + type]
                  if (list) {
                    for (i = list.length; i--;) {
                      if (!list[i].root && list[i].matches(element, original, null)) return true
                    }
                  }
                  return false
                }

              , get = function (element, type, original, root) {
                  var entries = []
                  forAll(element, type, original, null, root, function (entry) {
                    return entries.push(entry)
                  })
                  return entries
                }

              , put = function (entry) {
                  var has = !entry.root && !this.has(entry.element, entry.type, null, false)
                    , key = (entry.root ? 'r' : '$') + entry.type
                  ;(map[key] || (map[key] = [])).push(entry)
                  return has
                }

              , del = function (entry) {
                  forAll(entry.element, entry.type, null, entry.handler, entry.root, function (entry, list, i) {
                    list.splice(i, 1)
                    entry.removed = true
                    if (list.length === 0) delete map[(entry.root ? 'r' : '$') + entry.type]
                    return false
                  })
                }

                // dump all entries, used for onunload
              , entries = function () {
                  var t, entries = []
                  for (t in map) {
                    if (t.charAt(0) == '$') entries = entries.concat(map[t])
                  }
                  return entries
                }

            return { has: has, get: get, put: put, del: del, entries: entries }
          }())

          // we need a selector engine for delegated events, use querySelectorAll if it exists
          // but for older browsers we need Qwery, Sizzle or similar
        , selectorEngine
        , setSelectorEngine = function (e) {
            if (!arguments.length) {
              selectorEngine = doc.querySelectorAll
                ? function (s, r) {
                    return r.querySelectorAll(s)
                  }
                : function () {
                    throw new Error('Bean: No selector engine installed') // eeek
                  }
            } else {
              selectorEngine = e
            }
          }

          // we attach this listener to each DOM event that we need to listen to, only once
          // per event type per DOM element
        , rootListener = function (event, type) {
            if (!W3C_MODEL && type && event && event.propertyName != '_on' + type) return

            var listeners = registry.get(this, type || event.type, null, false)
              , l = listeners.length
              , i = 0

            event = new Event(event, this, true)
            if (type) event.type = type

            // iterate through all handlers registered for this type, calling them unless they have
            // been removed by a previous handler or stopImmediatePropagation() has been called
            for (; i < l && !event.isImmediatePropagationStopped(); i++) {
              if (!listeners[i].removed) listeners[i].handler.call(this, event)
            }
          }

          // add and remove listeners to DOM elements
        , listener = W3C_MODEL
            ? function (element, type, add) {
                // new browsers
                element[add ? addEvent : removeEvent](type, rootListener, false)
              }
            : function (element, type, add, custom) {
                // IE8 and below, use attachEvent/detachEvent and we have to piggy-back propertychange events
                // to simulate event bubbling etc.
                var entry
                if (add) {
                  registry.put(entry = new RegEntry(
                      element
                    , custom || type
                    , function (event) { // handler
                        rootListener.call(element, event, custom)
                      }
                    , rootListener
                    , null
                    , null
                    , true // is root
                  ))
                  if (custom && element['_on' + custom] == null) element['_on' + custom] = 0
                  entry.target.attachEvent('on' + entry.eventType, entry.handler)
                } else {
                  entry = registry.get(element, custom || type, rootListener, true)[0]
                  if (entry) {
                    entry.target.detachEvent('on' + entry.eventType, entry.handler)
                    registry.del(entry)
                  }
                }
              }

        , once = function (rm, element, type, fn, originalFn) {
            // wrap the handler in a handler that does a remove as well
            return function () {
              fn.apply(this, arguments)
              rm(element, type, originalFn)
            }
          }

        , removeListener = function (element, orgType, handler, namespaces) {
            var type     = orgType && orgType.replace(nameRegex, '')
              , handlers = registry.get(element, type, null, false)
              , removed  = {}
              , i, l

            for (i = 0, l = handlers.length; i < l; i++) {
              if ((!handler || handlers[i].original === handler) && handlers[i].inNamespaces(namespaces)) {
                // TODO: this is problematic, we have a registry.get() and registry.del() that
                // both do registry searches so we waste cycles doing this. Needs to be rolled into
                // a single registry.forAll(fn) that removes while finding, but the catch is that
                // we'll be splicing the arrays that we're iterating over. Needs extra tests to
                // make sure we don't screw it up. @rvagg
                registry.del(handlers[i])
                if (!removed[handlers[i].eventType] && handlers[i][eventSupport])
                  removed[handlers[i].eventType] = { t: handlers[i].eventType, c: handlers[i].type }
              }
            }
            // check each type/element for removed listeners and remove the rootListener where it's no longer needed
            for (i in removed) {
              if (!registry.has(element, removed[i].t, null, false)) {
                // last listener of this type, remove the rootListener
                listener(element, removed[i].t, false, removed[i].c)
              }
            }
          }

          // set up a delegate helper using the given selector, wrap the handler function
        , delegate = function (selector, fn) {
            //TODO: findTarget (therefore $) is called twice, once for match and once for
            // setting e.currentTarget, fix this so it's only needed once
            var findTarget = function (target, root) {
                  var i, array = isString(selector) ? selectorEngine(selector, root) : selector
                  for (; target && target !== root; target = target.parentNode) {
                    for (i = array.length; i--;) {
                      if (array[i] === target) return target
                    }
                  }
                }
              , handler = function (e) {
                  var match = findTarget(e.target, this)
                  if (match) fn.apply(match, arguments)
                }

            // __beanDel isn't pleasant but it's a private function, not exposed outside of Bean
            handler.__beanDel = {
                ft       : findTarget // attach it here for customEvents to use too
              , selector : selector
            }
            return handler
          }

        , fireListener = W3C_MODEL ? function (isNative, type, element) {
            // modern browsers, do a proper dispatchEvent()
            var evt = doc.createEvent(isNative ? 'HTMLEvents' : 'UIEvents')
            evt[isNative ? 'initEvent' : 'initUIEvent'](type, true, true, win, 1)
            element.dispatchEvent(evt)
          } : function (isNative, type, element) {
            // old browser use onpropertychange, just increment a custom property to trigger the event
            element = targetElement(element, isNative)
            isNative ? element.fireEvent('on' + type, doc.createEventObject()) : element['_on' + type]++
          }

          /**
            * Public API: off(), on(), add(), (remove()), one(), fire(), clone()
            */

          /**
            * off(element[, eventType(s)[, handler ]])
            */
        , off = function (element, typeSpec, fn) {
            var isTypeStr = isString(typeSpec)
              , k, type, namespaces, i

            if (isTypeStr && typeSpec.indexOf(' ') > 0) {
              // off(el, 't1 t2 t3', fn) or off(el, 't1 t2 t3')
              typeSpec = str2arr(typeSpec)
              for (i = typeSpec.length; i--;)
                off(element, typeSpec[i], fn)
              return element
            }

            type = isTypeStr && typeSpec.replace(nameRegex, '')
            if (type && customEvents[type]) type = customEvents[type].base

            if (!typeSpec || isTypeStr) {
              // off(el) or off(el, t1.ns) or off(el, .ns) or off(el, .ns1.ns2.ns3)
              if (namespaces = isTypeStr && typeSpec.replace(namespaceRegex, '')) namespaces = str2arr(namespaces, '.')
              removeListener(element, type, fn, namespaces)
            } else if (isFunction(typeSpec)) {
              // off(el, fn)
              removeListener(element, null, typeSpec)
            } else {
              // off(el, { t1: fn1, t2, fn2 })
              for (k in typeSpec) {
                if (typeSpec.hasOwnProperty(k)) off(element, k, typeSpec[k])
              }
            }

            return element
          }

          /**
            * on(element, eventType(s)[, selector], handler[, args ])
            */
        , on = function(element, events, selector, fn) {
            var originalFn, type, types, i, args, entry, first

            //TODO: the undefined check means you can't pass an 'args' argument, fix this perhaps?
            if (selector === undefined && typeof events == 'object') {
              //TODO: this can't handle delegated events
              for (type in events) {
                if (events.hasOwnProperty(type)) {
                  on.call(this, element, type, events[type])
                }
              }
              return
            }

            if (!isFunction(selector)) {
              // delegated event
              originalFn = fn
              args       = slice.call(arguments, 4)
              fn         = delegate(selector, originalFn, selectorEngine)
            } else {
              args       = slice.call(arguments, 3)
              fn         = originalFn = selector
            }

            types = str2arr(events)

            // special case for one(), wrap in a self-removing handler
            if (this === ONE) {
              fn = once(off, element, events, fn, originalFn)
            }

            for (i = types.length; i--;) {
              // add new handler to the registry and check if it's the first for this element/type
              first = registry.put(entry = new RegEntry(
                  element
                , types[i].replace(nameRegex, '') // event type
                , fn
                , originalFn
                , str2arr(types[i].replace(namespaceRegex, ''), '.') // namespaces
                , args
                , false // not root
              ))
              if (entry[eventSupport] && first) {
                // first event of this type on this element, add root listener
                listener(element, entry.eventType, true, entry.customType)
              }
            }

            return element
          }

          /**
            * add(element[, selector], eventType(s), handler[, args ])
            *
            * Deprecated: kept (for now) for backward-compatibility
            */
        , add = function (element, events, fn, delfn) {
            return on.apply(
                null
              , !isString(fn)
                  ? slice.call(arguments)
                  : [ element, fn, events, delfn ].concat(arguments.length > 3 ? slice.call(arguments, 5) : [])
            )
          }

          /**
            * one(element, eventType(s)[, selector], handler[, args ])
            */
        , one = function () {
            return on.apply(ONE, arguments)
          }

          /**
            * fire(element, eventType(s)[, args ])
            *
            * The optional 'args' argument must be an array, if no 'args' argument is provided
            * then we can use the browser's DOM event system, otherwise we trigger handlers manually
            */
        , fire = function (element, type, args) {
            var types = str2arr(type)
              , i, j, l, names, handlers

            for (i = types.length; i--;) {
              type = types[i].replace(nameRegex, '')
              if (names = types[i].replace(namespaceRegex, '')) names = str2arr(names, '.')
              if (!names && !args && element[eventSupport]) {
                fireListener(nativeEvents[type], type, element)
              } else {
                // non-native event, either because of a namespace, arguments or a non DOM element
                // iterate over all listeners and manually 'fire'
                handlers = registry.get(element, type, null, false)
                args = [false].concat(args)
                for (j = 0, l = handlers.length; j < l; j++) {
                  if (handlers[j].inNamespaces(names)) {
                    handlers[j].handler.apply(element, args)
                  }
                }
              }
            }
            return element
          }

          /**
            * clone(dstElement, srcElement[, eventType ])
            *
            * TODO: perhaps for consistency we should allow the same flexibility in type specifiers?
            */
        , clone = function (element, from, type) {
            var handlers = registry.get(from, type, null, false)
              , l = handlers.length
              , i = 0
              , args, beanDel

            for (; i < l; i++) {
              if (handlers[i].original) {
                args = [ element, handlers[i].type ]
                if (beanDel = handlers[i].handler.__beanDel) args.push(beanDel.selector)
                args.push(handlers[i].original)
                on.apply(null, args)
              }
            }
            return element
          }

        , bean = {
              'on'                : on
            , 'add'               : add
            , 'one'               : one
            , 'off'               : off
            , 'remove'            : off
            , 'clone'             : clone
            , 'fire'              : fire
            , 'Event'             : Event
            , 'setSelectorEngine' : setSelectorEngine
            , 'noConflict'        : function () {
                context[name] = old
                return this
              }
          }

      // for IE, clean up on unload to avoid leaks
      if (win.attachEvent) {
        var cleanup = function () {
          var i, entries = registry.entries()
          for (i in entries) {
            if (entries[i].type && entries[i].type !== 'unload') off(entries[i].element, entries[i].type)
          }
          win.detachEvent('onunload', cleanup)
          win.CollectGarbage && win.CollectGarbage()
        }
        win.attachEvent('onunload', cleanup)
      }

      // initialize selector engine to internal default (qSA or throw Error)
      setSelectorEngine(Ink.ss)

      return bean
    });

    /**
     * Keep this declaration here and off Bean as it extends the Event
     * object and some properties are readonly in strict mode
     */
    'use strict';

    var InkEvent = {

    KEY_BACKSPACE: 8,
    KEY_TAB:       9,
    KEY_RETURN:   13,
    KEY_ESC:      27,
    KEY_LEFT:     37,
    KEY_UP:       38,
    KEY_RIGHT:    39,
    KEY_DOWN:     40,
    KEY_DELETE:   46,
    KEY_HOME:     36,
    KEY_END:      35,
    KEY_PAGEUP:   33,
    KEY_PAGEDOWN: 34,
    KEY_INSERT:   45,
    
    /**
     * Creates a debounced version of a function.
     * Returns a function which calls `func`, waiting at least `wait` milliseconds between calls. This is useful for events such as `scroll` or `resize`, which can be triggered too many times per second, slowing down the browser with needless function calls.
     *
     * *note:* This does not delay the first function call to the function.
     *
     * @method throttle
     * @param {Function} func   Function to call. Arguments and context are both passed.
     * @param {Number} [wait]=0 Milliseconds to wait between calls.
     * @sample Ink_Dom_Event_1_throttle.html 
     **/
    throttle: function (func, wait) {
        wait = wait || 0;
        var lastCall = 0;  // Warning: This breaks on Jan 1st 1970 0:00
        var timeout;
        var throttled = function () {
            var now = +new Date();
            var timeDiff = now - lastCall;
            if (timeDiff >= wait) {
                lastCall = now;
                return func.apply(this, [].slice.call(arguments));
            } else {
                var that = this;
                var args = [].slice.call(arguments);
                if (!timeout) {
                    timeout = setTimeout(function () {
                        timeout = null;
                        return throttled.apply(that, args);
                    }, wait - timeDiff);
                }
            }
        };
        return throttled;
    },

    /**
     * Gets the event's target element.
     *
     * @method element
     * @param {Object} ev  Event object
     * @return {DOMNode} The target
     * @sample Ink_Dom_Event_1_element.html 
     */
    element: function(ev) {
        var node = ev.delegationTarget ||
            ev.target ||
            // IE stuff
            (ev.type === 'mouseout'   && ev.fromElement) ||
            (ev.type === 'mouseleave' && ev.fromElement) ||
            (ev.type === 'mouseover'  && ev.toElement) ||
            (ev.type === 'mouseenter' && ev.toElement) ||
            ev.srcElement ||
            null;
        return node && (node.nodeType === 3 || node.nodeType === 4) ? node.parentNode : node;
    },

    /**
     * Gets the event's related target element.
     *
     * @method relatedTarget
     * @param {Object} ev event object
     * @return {DOMNode} The related target
     * @sample Ink_Dom_Event_1_relatedTarget.html 
     */
    relatedTarget: function(ev){
        var node = ev.relatedTarget ||
            // IE stuff
            (ev.type === 'mouseout'   && ev.toElement) ||
            (ev.type === 'mouseleave' && ev.toElement) ||
            (ev.type === 'mouseover'  && ev.fromElement) ||
            (ev.type === 'mouseenter' && ev.fromElement) ||
            null;
        return node && (node.nodeType === 3 || node.nodeType === 4) ? node.parentNode : node;
    },

    /**
     * Find closest ancestor element by tag name related to the event target.
     * Navigate up the DOM tree, looking for a tag with the name `elmTagName`.
     *
     * If such tag is not found, `document` is returned.
     *
     * @method findElement
     * @param {Object}  ev              Event object
     * @param {String}  elmTagName      Tag name to find
     * @param {Boolean} [force]=false   Flag to skip returning `document` and to return `false` instead.
     * @return {DOMElement} the first element which matches given tag name or the document element if the wanted tag is not found
     * @sample Ink_Dom_Event_1_findElement.html 
     */
    findElement: function(ev, elmTagName, force)
    {
        var node = this.element(ev);
        while(true) {
            if(node.nodeName.toLowerCase() === elmTagName.toLowerCase()) {
                return node;
            } else {
                node = node.parentNode;
                if(!node) {
                    if(force) {
                        return false;
                    }
                    return document;
                }
                if(!node.parentNode){
                    if(force){ return false; }
                    return document;
                }
            }
        }
    },

    /**
     * Attaches an event to element
     *
     * @method observe
     * @param {DOMElement|String}  element      Element id or element
     * @param {String}             eventName    Event name
     * @param {Function}           callBack     Receives the event object as a parameter. If you're manually firing custom events, check it's eventName property to make sure you're handling the right event.
     * @param {Boolean}            [useCapture] Flag to change event listening from bubbling to capture.
     * @return {Function} The event handler used. Hang on to this if you want to `stopObserving` later.
     * @sample Ink_Dom_Event_1_observe.html 
     */
    observe: function(element, eventName, callBack, useCapture) {
        element = Ink.i(element);
        if(element) {
            if(element.addEventListener) {
                element.addEventListener(eventName, callBack, !!useCapture);
            } else {
                element.attachEvent('on' + eventName, (callBack = Ink.bind(callBack, element)));
            }
            return callBack;
        }
    },

    /**
     * Like observe, but listen to the event only once.
     *
     * @method observeOnce
     * @param {DOMElement|String}  element      Element id or element
     * @param {String}             eventName    Event name
     * @param {Function}           callBack     Receives the event object as a parameter. If you're manually firing custom events, check it's eventName property to make sure you're handling the right event.
     * @param {Boolean}            [useCapture] Flag to change event listening from bubbling to capture.
     * @return {Function} The event handler used. Hang on to this if you want to `stopObserving` later.
     * @sample Ink_Dom_Event_1_observeOnce.html 
     */
    observeOnce: function (element, eventName, callBack, useCapture) {
        var onceBack = function () {
            InkEvent.stopObserving(element, eventName, onceBack);
            return callBack();
        };
        return InkEvent.observe(element, eventName, onceBack, useCapture);
    },

    /**
     * Attaches an event to a selector or array of elements.
     *
     * @method observeMulti
     * @param {Array|String}        elements       
     * @param {String}              eventName    Event name
     * @param {Function}            callBack     Receives the event object as a parameter. If you're manually firing custom events, check it's eventName property to make sure you're handling the right event.
     * @param {Boolean}            [useCapture]  Flag change event listening from bubbling to capture.
     * @return {Function} The used callback.
     * @sample Ink_Dom_Event_1_observeMulti.html 
     */
    observeMulti: function (elements, eventName, callBack, useCapture) {
        if (typeof elements === 'string') {
            elements = Ink.ss(elements);
        } else if ( /* is an element */ elements && elements.nodeType === 1) {
            elements = [elements];
        }
        if (!elements[0]) { return false; }

        for (var i = 0, len = elements.length; i < len; i++) {
            this.observe(elements[i], eventName, callBack, useCapture);
        }
        return callBack;
    },

    /**
     * Observes an event on an element and its descendants matching the selector.
     *
     * Requires Ink.Dom.Selector if you need to use a selector.
     *
     * @method observeDelegated
     * @param {DOMElement|String} element   Element to observe.
     * @param {String}            eventName Event name to observe.
     * @param {String}            selector  Child element selector. When null, finds any element.
     * @param {Function}          callback  Callback to be called when the event is fired
     * @return {Function} The used callback, for ceasing to listen to the event later.
     * @sample Ink_Dom_Event_1_observeDelegated.html 
     **/
    observeDelegated: function (element, eventName, selector, callback) {
        return InkEvent.observe(element, eventName, function (event) {
            var fromElement = InkEvent.element(event);
            if (!fromElement || fromElement === element) { return; }

            var cursor = fromElement;

            // Go up the document tree until we hit the element itself.
            while (cursor !== element && cursor !== document && cursor) {
                if (Ink.Dom.Selector_1.matchesSelector(cursor, selector)) {
                    event.delegationTarget = cursor;
                    return callback(event);
                }
                cursor = cursor.parentNode;
            }
        });
    },

    /**
     * Removes an event attached to an element.
     *
     * @method stopObserving
     * @param {DOMElement|String}  element       Element id or element
     * @param {String}             eventName     Event name
     * @param {Function}           callBack      Callback function
     * @param {Boolean}            [useCapture]  Set to true if the event was being observed with useCapture set to true as well.
     * @sample Ink_Dom_Event_1_stopObserving.html 
     */
    stopObserving: function(element, eventName, callBack, useCapture) {
        element = Ink.i(element);

        if(element) {
            if(element.removeEventListener) {
                element.removeEventListener(eventName, callBack, !!useCapture);
            } else {
                element.detachEvent('on' + eventName, callBack);
            }
        }
    },

    /**
     * Stops event propagation and bubbling.
     *
     * @method stop
     * @param {Object} event  Event handle
     * @sample Ink_Dom_Event_1_stop.html 
     */
    stop: function(event)
    {
        if(event.cancelBubble !== null) {
            event.cancelBubble = true;
        }
        if(event.stopPropagation) {
            event.stopPropagation();
        }
        if(event.preventDefault) {
            event.preventDefault();
        }
        if(window.attachEvent) {
            event.returnValue = false;
        }
        if(event.cancel !== null) {
            event.cancel = true;
        }
    },

    /**
     * Stops event propagation.
     *
     * @method stopPropagation
     * @param {Object} event  Event handle
     * @sample Ink_Dom_Event_1_stopPropagation.html 
     */
    stopPropagation: function(event) {
        if(event.cancelBubble !== null) {
            event.cancelBubble = true;
        }
        if(event.stopPropagation) {
            event.stopPropagation();
        }
    },

    /**
     * Stops event default behaviour.
     *
     * @method stopDefault
     * @param {Object} event  Event handle
     * @sample Ink_Dom_Event_1_stopDefault.html 
     */
    stopDefault: function(event)
    {
        if(event.preventDefault) {
            event.preventDefault();
        }
        if(window.attachEvent) {
            event.returnValue = false;
        }
        if(event.cancel !== null) {
            event.cancel = true;
        }
    },

    /**
     * Gets the pointer's coordinates from the event object.
     *
     * @method pointer
     * @param {Object} ev Event object
     * @return {Object} An object with the mouse X and Y position
     * @sample Ink_Dom_Event_1_pointer.html 
     */
    pointer: function(ev)
    {
        return {
            x: this.pointerX(ev),
            y: this.pointerY(ev)
        };
    },

    /**
     * Gets the pointer's X coordinate.
     *
     * @method pointerX
     * @param {Object} ev Event object
     * @return {Number} Mouse X position
     */
    pointerX: function(ev)
    {
        return (ev.touches && ev.touches[0] && ev.touches[0].pageX) ||
            (ev.pageX) ||
            (ev.clientX + (document.documentElement.scrollLeft || document.body.scrollLeft));
    },

    /**
     * Gets the pointer's Y coordinate.
     *
     * @method pointerY
     * @param {Object} ev Event object
     * @return {Number} Mouse Y position
     */
    pointerY: function(ev)
    {
        return (ev.touches && ev.touches[0] && ev.touches[0].pageY) ||
            (ev.pageY) ||
            (ev.clientY + (document.documentElement.scrollTop || document.body.scrollTop));
    },

    /**
     * Checks if an event is a left click.
     *
     * @method isLeftClick
     * @param {Object} ev  Event object
     * @return {Boolean} True if the event is a left click
     * @sample Ink_Dom_Event_1_isLeftClick.html 
     */
    isLeftClick: function(ev) {
        if (window.addEventListener) {
            if(ev.button === 0){
                return true;
            } else if(ev.type === 'touchend' && ev.button === null){
                // [todo] do the above check for pointerEvents too
                return true;
            }
        }
        else {
            if(ev.button === 1){ return true; }
        }
        return false;
    },

    /**
     * Checks if an event is a right click.
     *
     * @method isRightClick
     * @param {Object} ev  Event object
     * @return {Boolean} True if the event is a right click
     * @sample Ink_Dom_Event_1_isRightClick.html 
     */
    isRightClick: function(ev) {
        return (ev.button === 2);
    },

    /**
     * Checks if an event is a middle click.
     *
     * @method isMiddleClick
     * @param {Object} ev  Event object
     * @return {Boolean} True if the event is a middle click
     * @sample Ink_Dom_Event_1_isMiddleClick.html 
     */
    isMiddleClick: function(ev) {
        if (window.addEventListener) {
            return (ev.button === 1);
        }
        else {
            return (ev.button === 4);
        }
        return false;
    },

    /**
     * Gets character from an event.
     *
     * @method getCharFromKeyboardEvent
     * @param {Object}   event           Keyboard event
     * @param {Boolean}  [changeCasing]  If true uppercases, if false lowercases, otherwise keeps casing
     * @return {String} Character representation of pressed key combination
     * @sample Ink_Dom_Event_1_getCharFromKeyboardEvent.html 
     */
    getCharFromKeyboardEvent: function(event, changeCasing) {
        var k = event.keyCode;
        var c = String.fromCharCode(k);

        var shiftOn = event.shiftKey;
        if (k >= 65 && k <= 90) {   // A-Z
            if (typeof changeCasing === 'boolean') {
                shiftOn = changeCasing;
            }
            return (shiftOn) ? c : c.toLowerCase();
        }
        else if (k >= 96 && k <= 105) { // numpad digits
            return String.fromCharCode( 48 + (k-96) );
        }
        switch (k) {
            case 109:   case 189:   return '-';
            case 107:   case 187:   return '+';
        }
        return c;
    },

    debug: function(){}
};

/**
 * Lets you attach event listeners to both elements and objects.
 * http://github.com/fat/bean#on
 *
 * @method on
 * @param {DOMElement|Object} element An HTML DOM element or any JavaScript Object
 * @param {String}            eventType An Event (or multiple events, space separated) to listen to
 * @param {String}            [selector] A CSS DOM Element selector string to bind the listener to child elements matching the selector
 * @param {Function}          [handler] The callback function
 * @param {Object}            [args...] Additional arguments to pass to the callback function when triggered
 * 
 * @return {DOMElement|Object} Returns the original DOM Element or Javascript Object
 * @sample Ink_Dom_Event_1_on.html 
 */

/**
 * Alias for `on` but will only be executed once.
 * bean.one() is an alias for bean.on() except that the handler will only be executed once and then removed for the event type(s).
 * http://github.com/fat/bean#one
 *
 * @method one
 * @param {DOMElement|Object} element An HTML DOM element or any JavaScript Object
 * @param {String}            eventType An Event (or multiple events, space separated) to listen to
 * @param {String}            [selector] A CSS DOM Element selector string to bind the listener to child elements matching the selector
 * @param {Function}          [handler] The callback function
 * @param                     [args...] Additional arguments to pass to the callback function when triggered
 * 
 * @return {DOMElement|Object} Returns the original DOM Element or Javascript Object
 * @sample Ink_Dom_Event_1_one.html 
 */

/**
 * Removes event handlers.
 * bean.off() is how you get rid of handlers once you no longer want them active. It's also a good idea to call off on elements before you remove them from your DOM; this gives Bean a chance to clean up some things and prevents memory leaks.
 * http://github.com/fat/bean#off
 *
 * @method off
 * @param {DOMElement|Object} element An HTML DOM element or any JavaScript Object
 * @param {String}            eventType An Event (or multiple events, space separated) to remove
 * @param {Function}          [handler] The specific callback function to remove
 * 
 * @return {DOMElement|Object} Returns the original DOM Element or Javascript Object
 * @sample Ink_Dom_Event_1_off.html 
 */

/**
 * Clones events from one object to another
 * bean.clone() is a method for cloning events from one DOM element or object to another.
 * http://github.com/fat/bean#clone
 *
 * @method clone
 * @param {DOMElement|Object} destElement An HTML DOM element or any JavaScript Object to copy events to
 * @param {String}            srcElement An HTML DOM element or any JavaScript Object to copy events from
 * @param {String}            [eventType] An Event (or multiple events, space separated) to clone
 * 
 * @return {DOMElement|Object} Returns the original DOM Element or Javascript Object
 * @sample Ink_Dom_Event_1_clone.html 
 */

/**
 * Triggers events.
 * http://github.com/fat/bean#fire
 *
 * @method fire
 * @param {DOMElement|Object} destElement An HTML DOM element or any JavaScript Object fire the event on
 * @param {String}            eventType An Event (or multiple events, space separated) to fire
 * @param                     [args...] Additional arguments to pass to the callback function when triggered
 *
 * @return {DOMElement|Object} Returns the original DOM Element or Javascript Object
 * @sample Ink_Dom_Event_1_fire.html 
 */

return Ink.extendObj(InkEvent, bean);

});

/**
 * @module Ink.Dom.FormSerialize_1
 * Two way serialization of form data and javascript objects.
 * Valid applications are ad hoc AJAX/syndicated submission of forms, restoring form values from server side state, etc.
 */

Ink.createModule('Ink.Dom.FormSerialize', 1, [], function () {
    'use strict';

    /**
     * @namespace Ink.Dom.FormSerialize
     * @static
     **/
    var FormSerialize = {

        /**
         * Serializes a form element into a JS object
         * It turns field names into keys and field values into values.
         *
         * note: Multi-select and checkboxes with multiple values will result in arrays
         *
         * @method serialize
         * @param {DOMElement|String}   form    Form element to extract data
         * @return {Object} Map of fieldName -> String|String[]|Boolean
         * @sample Ink_Dom_FormSerialize_serialize.html 
         */
        serialize: function(form) {
            form = Ink.i(form);
            var map = this._getFieldNameInputsMap(form);

            var map2 = {};
            for (var k in map) if (map.hasOwnProperty(k)) {
                if(k !== null) {
                    var tmpK = k.replace(/\[\]$/, '');
                    map2[tmpK] = this._getValuesOfField( map[k] );
                } else {
                    map2[k] = this._getValuesOfField( map[k] );
                }
            }

            delete map2['null'];    // this can occur. if so, delete it...
            return map2;
        },




        /**
         * Sets form elements' values with values from an object
         *
         * Note: You can't set the values of an input with `type="file"` (browser prohibits it)
         *
         * @method fillIn 
         * @param {DOMElement|String}   form    Form element to be populated
         * @param {Object}              map2    Map of fieldName -> String|String[]|Boolean
         * @sample Ink_Dom_FormSerialize_fillIn.html 
         */
        fillIn: function(form, map2) {
            form = Ink.i(form);
            var map = this._getFieldNameInputsMap(form);
            delete map['null']; // this can occur. if so, delete it...

            for (var k in map2) if (map2.hasOwnProperty(k)) {
                this._setValuesOfField( map[k], map2[k] );
            }
        },



        _getFieldNameInputsMap: function(formEl) {
            var name, nodeName, el, map = {};
            for (var i = 0, f = formEl.elements.length; i < f; ++i) {
                el = formEl.elements[i];
                name = el.getAttribute('name');
                nodeName = el.nodeName.toLowerCase();
                if (nodeName === 'fieldset') {
                    continue;
                } else if (map[name] === undefined) {
                    map[name] = [el];
                } else {
                    map[name].push(el);
                }
            }
            return map;
        },



        _getValuesOfField: function(fieldInputs) {
            var nodeName = fieldInputs[0].nodeName.toLowerCase();
            var type = fieldInputs[0].getAttribute('type');
            var value = fieldInputs[0].value;
            var i, f, j, o, el, m, res = [];

            switch(nodeName) {
                case 'select':
                    for (i = 0, f = fieldInputs.length; i < f; ++i) {
                        res[i] = [];
                        m = fieldInputs[i].getAttribute('multiple');
                        for (j = 0, o = fieldInputs[i].options.length; j < o; ++j) {
                            el = fieldInputs[i].options[j];
                            if (el.selected) {
                                if (m) {
                                    res[i].push(el.value);
                                } else {
                                    res[i] = el.value;
                                    break;
                                }
                            }
                        }
                    }
                    return ((fieldInputs.length > 0 && /\[[^\]]*\]$/.test(fieldInputs[0].getAttribute('name'))) ? res : res[0]);

                case 'textarea':
                case 'input':
                    if (type === 'checkbox' || type === 'radio') {
                        for (i = 0, f = fieldInputs.length; i < f; ++i) {
                            el = fieldInputs[i];
                            if (el.checked) {
                                res.push(    el.value    );
                            }
                        }
                        if (type === 'checkbox') {
                            return (fieldInputs.length > 1) ? res : !!(res.length);
                        }
                        return (fieldInputs.length > 1) ? res[0] : !!(res.length);    // on radios only 1 option is selected at most
                    }
                    else {
                        //if (fieldInputs.length > 1) {    throw 'Got multiple input elements with same name!';    }
                        if(fieldInputs.length > 0 && /\[[^\]]*\]$/.test(fieldInputs[0].getAttribute('name'))) {
                            var tmpValues = [];
                            for(i=0, f = fieldInputs.length; i < f; ++i) {
                                tmpValues.push(fieldInputs[i].value);
                            }
                            return tmpValues;
                        } else {
                            return value;
                        }
                    }
                    break;    // to keep JSHint happy...  (reply to this comment by gamboa: - ROTFL)

                default:
                    //throw 'Unsupported element: "' + nodeName + '"!';
                    return undefined;
            }
        },



        _valInArray: function(val, arr) {
            for (var i = 0, f = arr.length; i < f; ++i) {
                if (arr[i] === val) {    return true;    }
            }
            return false;
        },



        _setValuesOfField: function(fieldInputs, fieldValues) {
            if (!fieldInputs) {    return;    }
            var nodeName = fieldInputs[0].nodeName.toLowerCase();
            var type = fieldInputs[0].getAttribute('type');
            var i, f, el;

            switch(nodeName) {
                case 'select':
                    if (fieldInputs.length > 1) {    
                        Ink.warn('FormSerialize - Got multiple select elements with same name!');
                    }
                    for (i = 0, f = fieldInputs[0].options.length; i < f; ++i) {
                        el = fieldInputs[0].options[i];
                        el.selected = (fieldValues instanceof Array) ? this._valInArray(el.value, fieldValues) : el.value === fieldValues;
                    }
                    break;
                case 'textarea':
                case 'input':
                    if (type === 'checkbox' || type === 'radio') {
                        for (i = 0, f = fieldInputs.length; i < f; ++i) {
                            el = fieldInputs[i];
                            //el.checked = (fieldValues instanceof Array) ? this._valInArray(el.value, fieldValues) : el.value === fieldValues;
                            el.checked = (fieldValues instanceof Array) ? this._valInArray(el.value, fieldValues) : (fieldInputs.length > 1 ? el.value === fieldValues : !!fieldValues);
                        }
                    }
                    else {
                        if (fieldInputs.length > 1) {
                            Ink.warn('FormSerialize - Got multiple input elements with same name!'); 
                        }
                        if (type !== 'file') {
                            fieldInputs[0].value = fieldValues;
                        }
                    }
                    break;

                default:
                    Ink.warn('FormSerialize - Unsupported element: "' + nodeName + '"!');
            }
        }
    };

    return FormSerialize;
});

/**
 * Execute code only when the DOM is loaded.
 * @module Ink.Dom.Loaded_1
 * @version 1
 */
 
Ink.createModule('Ink.Dom.Loaded', 1, [], function() {

    'use strict';

    /**
     * @namespace Ink.Dom.Loaded_1
     **/
    var Loaded = {

        /**
         * Callbacks and their contexts. Array of 2-arrays.
         *
         * []
         *
         * @attribute _contexts Array
         * @private
         * 
         */
        _contexts: [], // Callbacks' queue

        /**
         * Specify a function to execute when the DOM is fully loaded.
         *
         * @method run
         * @param {Object}   [win]=window   Window object to attach/add the event
         * @param {Function} fn             Callback function to be executed after the DOM is ready
         * @public
         * @sample Ink_Dom_Loaded_run.html 
         */
        run: function(win, fn) {
            if (!fn) {
                fn  = win;
                win = window;
            }

            var context;

            for (var i = 0, len = this._contexts.length; i < len; i++) {
                if (this._contexts[i][0] === win) {
                    context = this._contexts[i][1];
                    break;
                }
            }
            if (!context) {
                context = {
                    cbQueue: [],
                    win: win,
                    doc: win.document,
                    root: win.document.documentElement,
                    done: false,
                    top: true
                };
                context.handlers = {
                    checkState: Ink.bindEvent(this._checkState, this, context),
                    poll: Ink.bind(this._poll, this, context)
                };
                this._contexts.push(
                    [win, context]  // Javascript Objects cannot map different windows to
                                    // different values.
                );
            }

            var   ael = context.doc.addEventListener;
            context.add = ael ? 'addEventListener' : 'attachEvent';
            context.rem = ael ? 'removeEventListener' : 'detachEvent';
            context.pre = ael ? '' : 'on';
            context.det = ael ? 'DOMContentLoaded' : 'onreadystatechange';
            context.wet = context.pre + 'load';

            var csf = context.handlers.checkState;
            var alreadyLoaded = (
                context.doc.readyState === 'complete' &&
                context.win.location.toString() !== 'about:blank');  // https://code.google.com/p/chromium/issues/detail?id=32357

            if (alreadyLoaded){
                setTimeout(Ink.bind(function () {
                    fn.call(context.win, 'lazy');
                }, this), 0);
            } else {
                context.cbQueue.push(fn);

                context.doc[context.add]( context.det , csf );
                context.win[context.add]( context.wet , csf );

                var frameElement = 1;
                try{
                    frameElement = context.win.frameElement;
                } catch(e) {}
                if ( !ael && context.root && context.root.doScroll ) { // IE HACK
                    try {
                        context.top = !frameElement;
                    } catch(e) { }
                    if (context.top) {
                        this._poll(context);
                    }
                }
            }
        },

        /**
         * Function that will be running the callbacks after the page is loaded
         *
         * @method _checkState
         * @param {Event} event Triggered event
         * @private
         */
        _checkState: function(event, context) {
            if ( !event || (event.type === 'readystatechange' && context.doc.readyState !== 'complete')) {
                return;
            }
            var where = (event.type === 'load') ? context.win : context.doc;
            where[context.rem](context.pre+event.type, context.handlers.checkState, false);
            this._ready(context);
        },

        /**
         * Polls the load progress of the page to see if it has already loaded or not
         *
         * @method _poll
         * @private
         */

        /**
         *
         * function _poll
         */
        _poll: function(context) {
            try {
                context.root.doScroll('left');
            } catch(e) {
                return setTimeout(context.handlers.poll, 50);
            }
            this._ready(context);
        },

        /**
         * Function that runs the callbacks from the queue when the document is ready.
         *
         * @method _ready
         * @private
         */
        _ready: function(context) {
            if (!context.done) {
                context.done = true;
                for (var i = 0; i < context.cbQueue.length; ++i) {
                    context.cbQueue[i].call(context.win);
                }
                context.cbQueue = [];
            }
        }
    };

    return Loaded;

});

/**
 * CSS selector engine
 * @module Ink.Dom.Selector_1
 * @version 1
 */
 
Ink.createModule('Ink.Dom.Selector', 1, [], function() {
    /*jshint forin:false, eqnull:true, noempty:false, expr:true, boss:true, maxdepth:false*/
	'use strict';

/*!
 * Sizzle CSS Selector Engine
 * Copyright 2013 jQuery Foundation and other contributors
 * Released under the MIT license
 * http://sizzlejs.com/
 */

var i,
	cachedruns,
	Expr,
	getText,
	isXML,
	compile,
	outermostContext,
	recompare,
	sortInput,

	// Local document vars
	setDocument,
	document,
	docElem,
	documentIsHTML,
	rbuggyQSA,
	rbuggyMatches,
	matches,
	contains,

	// Instance-specific data
	expando = "sizzle" + -(new Date()),
	preferredDoc = window.document,
	support = {},
	dirruns = 0,
	done = 0,
	classCache = createCache(),
	tokenCache = createCache(),
	compilerCache = createCache(),
	hasDuplicate = false,
	sortOrder = function() { return 0; },

	// General-purpose constants
	strundefined = typeof undefined,
	MAX_NEGATIVE = 1 << 31,

	// Array methods
	arr = [],
	pop = arr.pop,
	push_native = arr.push,
	push = arr.push,
	slice = arr.slice,
	// Use a stripped-down indexOf if we can't use a native one
	indexOf = arr.indexOf || function( elem ) {
		var i = 0,
			len = this.length;
		for ( ; i < len; i++ ) {
			if ( this[i] === elem ) {
				return i;
			}
		}
		return -1;
	},


	// Regular expressions

	// Whitespace characters http://www.w3.org/TR/css3-selectors/#whitespace
	whitespace = "[\\x20\\t\\r\\n\\f]",
	// http://www.w3.org/TR/css3-syntax/#characters
	characterEncoding = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",

	// Loosely modeled on CSS identifier characters
	// An unquoted value should be a CSS identifier http://www.w3.org/TR/css3-selectors/#attribute-selectors
	// Proper syntax: http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
	identifier = characterEncoding.replace( "w", "w#" ),

	// Acceptable operators http://www.w3.org/TR/selectors/#attribute-selectors
	operators = "([*^$|!~]?=)",
	attributes = "\\[" + whitespace + "*(" + characterEncoding + ")" + whitespace +
		"*(?:" + operators + whitespace + "*(?:(['\"])((?:\\\\.|[^\\\\])*?)\\3|(" + identifier + ")|)|)" + whitespace + "*\\]",

	// Prefer arguments quoted,
	//   then not containing pseudos/brackets,
	//   then attribute selectors/non-parenthetical expressions,
	//   then anything else
	// These preferences are here to reduce the number of selectors
	//   needing tokenize in the PSEUDO preFilter
	pseudos = ":(" + characterEncoding + ")(?:\\(((['\"])((?:\\\\.|[^\\\\])*?)\\3|((?:\\\\.|[^\\\\()[\\]]|" + attributes.replace( 3, 8 ) + ")*)|.*)\\)|)",

	// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
	rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

	rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
	rcombinators = new RegExp( "^" + whitespace + "*([\\x20\\t\\r\\n\\f>+~])" + whitespace + "*" ),
	rpseudo = new RegExp( pseudos ),
	ridentifier = new RegExp( "^" + identifier + "$" ),

	matchExpr = {
		"ID": new RegExp( "^#(" + characterEncoding + ")" ),
		"CLASS": new RegExp( "^\\.(" + characterEncoding + ")" ),
		"NAME": new RegExp( "^\\[name=['\"]?(" + characterEncoding + ")['\"]?\\]" ),
		"TAG": new RegExp( "^(" + characterEncoding.replace( "w", "w*" ) + ")" ),
		"ATTR": new RegExp( "^" + attributes ),
		"PSEUDO": new RegExp( "^" + pseudos ),
		"CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
			"*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
			"*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
		// For use in libraries implementing .is()
		// We use this for POS matching in `select`
		"needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
			whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
	},

	rsibling = /[\x20\t\r\n\f]*[+~]/,

	rnative = /^[^{]+\{\s*\[native code/,

	// Easily-parseable/retrievable ID or TAG or CLASS selectors
	rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

	rinputs = /^(?:input|select|textarea|button)$/i,
	rheader = /^h\d$/i,

	rescape = /'|\\/g,
	rattributeQuotes = /\=[\x20\t\r\n\f]*([^'"\]]*)[\x20\t\r\n\f]*\]/g,

	// CSS escapes http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
	runescape = /\\([\da-fA-F]{1,6}[\x20\t\r\n\f]?|.)/g,
	funescape = function( _, escaped ) {
		var high = "0x" + escaped - 0x10000;
		// NaN means non-codepoint
		return high !== high ?
			escaped :
			// BMP codepoint
			high < 0 ?
				String.fromCharCode( high + 0x10000 ) :
				// Supplemental Plane codepoint (surrogate pair)
				String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
	};

// Optimize for push.apply( _, NodeList )
try {
	push.apply(
		(arr = slice.call( preferredDoc.childNodes )),
		preferredDoc.childNodes
	);
	// Support: Android<4.0
	// Detect silently failing push.apply
	arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
	push = { apply: arr.length ?

		// Leverage slice if possible
		function( target, els ) {
			push_native.apply( target, slice.call(els) );
		} :

		// Support: IE<9
		// Otherwise append directly
		function( target, els ) {
			var j = target.length,
				i = 0;
			// Can't trust NodeList.length
			while ( (target[j++] = els[i++]) ) {}
			target.length = j - 1;
		}
	};
}

/*
 * For feature detection
 * @param {Function} fn The function to test for native support
 */
function isNative( fn ) {
	return rnative.test( fn + "" );
}

/*
 * Create key-value caches of limited size
 * @returns {Function(string, Object)} Returns the Object data after storing it on itself with
 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *	deleting the oldest entry
 */
function createCache() {
	var cache,
		keys = [];

	return (cache = function( key, value ) {
		// Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
		if ( keys.push( key += " " ) > Expr.cacheLength ) {
			// Only keep the most recent entries
			delete cache[ keys.shift() ];
		}
		return (cache[ key ] = value);
	});
}

/*
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
	fn[ expando ] = true;
	return fn;
}

/*
 * Support testing using an element
 * @param {Function} fn Passed the created div and expects a boolean result
 */
function assert( fn ) {
	var div = document.createElement("div");

	try {
		return !!fn( div );
	} catch (e) {
		return false;
	} finally {
		// release memory in IE
		div = null;
	}
}

function Sizzle( selector, context, results, seed ) {
	var match, elem, m, nodeType,
		// QSA vars
		i, groups, old, nid, newContext, newSelector;

	if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
		setDocument( context );
	}

	context = context || document;
	results = results || [];

	if ( !selector || typeof selector !== "string" ) {
		return results;
	}

	if ( (nodeType = context.nodeType) !== 1 && nodeType !== 9 ) {
		return [];
	}

	if ( documentIsHTML && !seed ) {

		// Shortcuts
		if ( (match = rquickExpr.exec( selector )) ) {
			// Speed-up: Sizzle("#ID")
			if ( (m = match[1]) ) {
				if ( nodeType === 9 ) {
					elem = context.getElementById( m );
					// Check parentNode to catch when Blackberry 4.6 returns
					// nodes that are no longer in the document #6963
					if ( elem && elem.parentNode ) {
						// Handle the case where IE, Opera, and Webkit return items
						// by name instead of ID
						if ( elem.id === m ) {
							results.push( elem );
							return results;
						}
					} else {
						return results;
					}
				} else {
					// Context is not a document
					if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
						contains( context, elem ) && elem.id === m ) {
						results.push( elem );
						return results;
					}
				}

			// Speed-up: Sizzle("TAG")
			} else if ( match[2] ) {
				push.apply( results, context.getElementsByTagName( selector ) );
				return results;

			// Speed-up: Sizzle(".CLASS")
			} else if ( (m = match[3]) && support.getElementsByClassName && context.getElementsByClassName ) {
				push.apply( results, context.getElementsByClassName( m ) );
				return results;
			}
		}

		// QSA path
		if ( support.qsa && !rbuggyQSA.test(selector) ) {
			old = true;
			nid = expando;
			newContext = context;
			newSelector = nodeType === 9 && selector;

			// qSA works strangely on Element-rooted queries
			// We can work around this by specifying an extra ID on the root
			// and working up from there (Thanks to Andrew Dupont for the technique)
			// IE 8 doesn't work on object elements
			if ( nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
				groups = tokenize( selector );

				if ( (old = context.getAttribute("id")) ) {
					nid = old.replace( rescape, "\\$&" );
				} else {
					context.setAttribute( "id", nid );
				}
				nid = "[id='" + nid + "'] ";

				i = groups.length;
				while ( i-- ) {
					groups[i] = nid + toSelector( groups[i] );
				}
				newContext = rsibling.test( selector ) && context.parentNode || context;
				newSelector = groups.join(",");
			}

			if ( newSelector ) {
				try {
					push.apply( results,
						newContext.querySelectorAll( newSelector )
					);
					return results;
				} catch(qsaError) {
				} finally {
					if ( !old ) {
						context.removeAttribute("id");
					}
				}
			}
		}
	}

	// All others
	return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/*
 * Detect xml
 * @param {Element|Object} elem An element or a document
 */
isXML = Sizzle.isXML = function( elem ) {
	// documentElement is verified for cases where it doesn't yet exist
	// (such as loading iframes in IE - #4833)
	var documentElement = elem && (elem.ownerDocument || elem).documentElement;
	return documentElement ? documentElement.nodeName !== "HTML" : false;
};

/*
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
	var doc = node ? node.ownerDocument || node : preferredDoc;

	// If no document and documentElement is available, return
	if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
		return document;
	}

	// Set our document
	document = doc;
	docElem = doc.documentElement;

	// Support tests
	documentIsHTML = !isXML( doc );

	// Check if getElementsByTagName("*") returns only elements
	support.getElementsByTagName = assert(function( div ) {
		div.appendChild( doc.createComment("") );
		return !div.getElementsByTagName("*").length;
	});

	// Check if attributes should be retrieved by attribute nodes
	support.attributes = assert(function( div ) {
		div.innerHTML = "<select></select>";
		var type = typeof div.lastChild.getAttribute("multiple");
		// IE8 returns a string for some attributes even when not present
		return type !== "boolean" && type !== "string";
	});

	// Check if getElementsByClassName can be trusted
	support.getElementsByClassName = assert(function( div ) {
		// Opera can't find a second classname (in 9.6)
		div.innerHTML = "<div class='hidden e'></div><div class='hidden'></div>";
		if ( !div.getElementsByClassName || !div.getElementsByClassName("e").length ) {
			return false;
		}

		// Safari 3.2 caches class attributes and doesn't catch changes
		div.lastChild.className = "e";
		return div.getElementsByClassName("e").length === 2;
	});

	// Check if getElementsByName privileges form controls or returns elements by ID
	// If so, assume (for broader support) that getElementById returns elements by name
	support.getByName = assert(function( div ) {
		// Inject content
		div.id = expando + 0;
		// Support: Windows 8 Native Apps
		// Assigning innerHTML with "name" attributes throws uncatchable exceptions
		// http://msdn.microsoft.com/en-us/library/ie/hh465388.aspx
		div.appendChild( document.createElement("a") ).setAttribute( "name", expando );
		div.appendChild( document.createElement("i") ).setAttribute( "name", expando );
		docElem.appendChild( div );

		// Test
		var pass = doc.getElementsByName &&
			// buggy browsers will return fewer than the correct 2
			doc.getElementsByName( expando ).length === 2 +
			// buggy browsers will return more than the correct 0
			doc.getElementsByName( expando + 0 ).length;

		// Cleanup
		docElem.removeChild( div );

		return pass;
	});

	// Support: Webkit<537.32
	// Detached nodes confoundingly follow *each other*
	support.sortDetached = assert(function( div1 ) {
		return div1.compareDocumentPosition &&
			// Should return 1, but Webkit returns 4 (following)
			(div1.compareDocumentPosition( document.createElement("div") ) & 1);
	});

	// IE6/7 return modified attributes
	Expr.attrHandle = assert(function( div ) {
		div.innerHTML = "<a href='#'></a>";
		return div.firstChild && typeof div.firstChild.getAttribute !== strundefined &&
			div.firstChild.getAttribute("href") === "#";
	}) ?
		{} :
		{
			"href": function( elem ) {
				return elem.getAttribute( "href", 2 );
			},
			"type": function( elem ) {
				return elem.getAttribute("type");
			}
		};

	// ID find and filter
	if ( support.getByName ) {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== strundefined && documentIsHTML ) {
				var m = context.getElementById( id );
				// Check parentNode to catch when Blackberry 4.6 returns
				// nodes that are no longer in the document #6963
				return m && m.parentNode ? [m] : [];
			}
		};
		Expr.filter["ID"] = function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				return elem.getAttribute("id") === attrId;
			};
		};
	} else {
		Expr.find["ID"] = function( id, context ) {
			if ( typeof context.getElementById !== strundefined && documentIsHTML ) {
				var m = context.getElementById( id );

				return m ?
					m.id === id || typeof m.getAttributeNode !== strundefined && m.getAttributeNode("id").value === id ?
						[m] :
						undefined :
					[];
			}
		};
		Expr.filter["ID"] =  function( id ) {
			var attrId = id.replace( runescape, funescape );
			return function( elem ) {
				var node = typeof elem.getAttributeNode !== strundefined && elem.getAttributeNode("id");
				return node && node.value === attrId;
			};
		};
	}

	// Tag
	Expr.find["TAG"] = support.getElementsByTagName ?
		function( tag, context ) {
			if ( typeof context.getElementsByTagName !== strundefined ) {
				return context.getElementsByTagName( tag );
			}
		} :
		function( tag, context ) {
			var elem,
				tmp = [],
				i = 0,
				results = context.getElementsByTagName( tag );

			// Filter out possible comments
			if ( tag === "*" ) {
				while ( (elem = results[i++]) ) {
					if ( elem.nodeType === 1 ) {
						tmp.push( elem );
					}
				}

				return tmp;
			}
			return results;
		};

	// Name
	Expr.find["NAME"] = support.getByName && function( tag, context ) {
		if ( typeof context.getElementsByName !== strundefined ) {
			return context.getElementsByName( name );
		}
	};

	// Class
	Expr.find["CLASS"] = support.getElementsByClassName && function( className, context ) {
		if ( typeof context.getElementsByClassName !== strundefined && documentIsHTML ) {
			return context.getElementsByClassName( className );
		}
	};

	// QSA and matchesSelector support

	// matchesSelector(:active) reports false when true (IE9/Opera 11.5)
	rbuggyMatches = [];

	// qSa(:focus) reports false when true (Chrome 21),
	// no need to also add to buggyMatches since matches checks buggyQSA
	// A support test would require too much code (would include document ready)
	rbuggyQSA = [ ":focus" ];

	if ( (support.qsa = isNative(doc.querySelectorAll)) ) {
		// Build QSA regex
		// Regex strategy adopted from Diego Perini
		assert(function( div ) {
			// Select is set to empty string on purpose
			// This is to test IE's treatment of not explicitly
			// setting a boolean content attribute,
			// since its presence should be enough
			// http://bugs.jquery.com/ticket/12359
			div.innerHTML = "<select><option selected=''></option></select>";

			// IE8 - Some boolean attributes are not treated correctly
			if ( !div.querySelectorAll("[selected]").length ) {
				rbuggyQSA.push( "\\[" + whitespace + "*(?:checked|disabled|ismap|multiple|readonly|selected|value)" );
			}

			// Webkit/Opera - :checked should return selected option elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":checked").length ) {
				rbuggyQSA.push(":checked");
			}
		});

		assert(function( div ) {

			// Opera 10-12/IE8 - ^= $= *= and empty values
			// Should not select anything
			div.innerHTML = "<input type='hidden' i=''/>";
			if ( div.querySelectorAll("[i^='']").length ) {
				rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:\"\"|'')" );
			}

			// FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
			// IE8 throws error here and will not see later tests
			if ( !div.querySelectorAll(":enabled").length ) {
				rbuggyQSA.push( ":enabled", ":disabled" );
			}

			// Opera 10-11 does not throw on post-comma invalid pseudos
			div.querySelectorAll("*,:x");
			rbuggyQSA.push(",.*:");
		});
	}

	if ( (support.matchesSelector = isNative( (matches = docElem.matchesSelector ||
		docElem.mozMatchesSelector ||
		docElem.webkitMatchesSelector ||
		docElem.oMatchesSelector ||
		docElem.msMatchesSelector) )) ) {

		assert(function( div ) {
			// Check to see if it's possible to do matchesSelector
			// on a disconnected node (IE 9)
			support.disconnectedMatch = matches.call( div, "div" );

			// This should fail with an exception
			// Gecko does not error, returns false instead
			matches.call( div, "[s!='']:x" );
			rbuggyMatches.push( "!=", pseudos );
		});
	}

	rbuggyQSA = new RegExp( rbuggyQSA.join("|") );
	rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join("|") );

	// Element contains another
	// Purposefully does not implement inclusive descendent
	// As in, an element does not contain itself
	contains = isNative(docElem.contains) || docElem.compareDocumentPosition ?
		function( a, b ) {
			var adown = a.nodeType === 9 ? a.documentElement : a,
				bup = b && b.parentNode;
			return a === bup || !!( bup && bup.nodeType === 1 && (
				adown.contains ?
					adown.contains( bup ) :
					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
			));
		} :
		function( a, b ) {
			if ( b ) {
				while ( (b = b.parentNode) ) {
					if ( b === a ) {
						return true;
					}
				}
			}
			return false;
		};

	// Document order sorting
	sortOrder = docElem.compareDocumentPosition ?
	function( a, b ) {

		// Flag for duplicate removal
		if ( a === b ) {
			hasDuplicate = true;
			return 0;
		}

		var compare = b.compareDocumentPosition && a.compareDocumentPosition && a.compareDocumentPosition( b );

		if ( compare ) {
			// Disconnected nodes
			if ( compare & 1 ||
				(recompare && b.compareDocumentPosition( a ) === compare) ) {

				// Choose the first element that is related to our preferred document
				if ( a === doc || contains(preferredDoc, a) ) {
					return -1;
				}
				if ( b === doc || contains(preferredDoc, b) ) {
					return 1;
				}

				// Maintain original order
				return sortInput ?
					( indexOf.call( sortInput, a ) - indexOf.call( sortInput, b ) ) :
					0;
			}

			return compare & 4 ? -1 : 1;
		}

		// Not directly comparable, sort on existence of method
		return a.compareDocumentPosition ? -1 : 1;
	} :
	function( a, b ) {
		var cur,
			i = 0,
			aup = a.parentNode,
			bup = b.parentNode,
			ap = [ a ],
			bp = [ b ];

		// Exit early if the nodes are identical
		if ( a === b ) {
			hasDuplicate = true;
			return 0;

		// Parentless nodes are either documents or disconnected
		} else if ( !aup || !bup ) {
			return a === doc ? -1 :
				b === doc ? 1 :
				aup ? -1 :
				bup ? 1 :
				0;

		// If the nodes are siblings, we can do a quick check
		} else if ( aup === bup ) {
			return siblingCheck( a, b );
		}

		// Otherwise we need full lists of their ancestors for comparison
		cur = a;
		while ( (cur = cur.parentNode) ) {
			ap.unshift( cur );
		}
		cur = b;
		while ( (cur = cur.parentNode) ) {
			bp.unshift( cur );
		}

		// Walk down the tree looking for a discrepancy
		while ( ap[i] === bp[i] ) {
			i++;
		}

		return i ?
			// Do a sibling check if the nodes have a common ancestor
			siblingCheck( ap[i], bp[i] ) :

			// Otherwise nodes in our document sort first
			ap[i] === preferredDoc ? -1 :
			bp[i] === preferredDoc ? 1 :
			0;
	};

	return document;
};

Sizzle.matches = function( expr, elements ) {
	return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	// Make sure that attribute selectors are quoted
	expr = expr.replace( rattributeQuotes, "='$1']" );

	// rbuggyQSA always contains :focus, so no need for an existence check
	if ( support.matchesSelector && documentIsHTML && (!rbuggyMatches || !rbuggyMatches.test(expr)) && !rbuggyQSA.test(expr) ) {
		try {
			var ret = matches.call( elem, expr );

			// IE 9's matchesSelector returns false on disconnected nodes
			if ( ret || support.disconnectedMatch ||
					// As well, disconnected nodes are said to be in a document
					// fragment in IE 9
					elem.document && elem.document.nodeType !== 11 ) {
				return ret;
			}
		} catch(e) {}
	}

	return Sizzle( expr, document, null, [elem] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
	// Set document vars if needed
	if ( ( context.ownerDocument || context ) !== document ) {
		setDocument( context );
	}
	return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
	var val;

	// Set document vars if needed
	if ( ( elem.ownerDocument || elem ) !== document ) {
		setDocument( elem );
	}

	if ( documentIsHTML ) {
		name = name.toLowerCase();
	}
	if ( (val = Expr.attrHandle[ name ]) ) {
		return val( elem );
	}
	if ( !documentIsHTML || support.attributes ) {
		return elem.getAttribute( name );
	}
	return ( (val = elem.getAttributeNode( name )) || elem.getAttribute( name ) ) && elem[ name ] === true ?
		name :
		val && val.specified ? val.value : null;
};

Sizzle.error = function( msg ) {
	throw new Error( "Syntax error, unrecognized expression: " + msg );
};

// Document sorting and removing duplicates
Sizzle.uniqueSort = function( results ) {
	var elem,
		duplicates = [],
		j = 0,
		i = 0;

	// Unless we *know* we can detect duplicates, assume their presence
	hasDuplicate = !support.detectDuplicates;
	// Compensate for sort limitations
	recompare = !support.sortDetached;
	sortInput = !support.sortStable && results.slice( 0 );
	results.sort( sortOrder );

	if ( hasDuplicate ) {
		while ( (elem = results[i++]) ) {
			if ( elem === results[ i ] ) {
				j = duplicates.push( i );
			}
		}
		while ( j-- ) {
			results.splice( duplicates[ j ], 1 );
		}
	}

	return results;
};

/*
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns Returns -1 if a precedes b, 1 if a follows b
 */
function siblingCheck( a, b ) {
	var cur = b && a,
		diff = cur && ( ~b.sourceIndex || MAX_NEGATIVE ) - ( ~a.sourceIndex || MAX_NEGATIVE );

	// Use IE sourceIndex if available on both nodes
	if ( diff ) {
		return diff;
	}

	// Check if b follows a
	if ( cur ) {
		while ( (cur = cur.nextSibling) ) {
			if ( cur === b ) {
				return -1;
			}
		}
	}

	return a ? 1 : -1;
}

// Returns a function to use in pseudos for input types
function createInputPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return name === "input" && elem.type === type;
	};
}

// Returns a function to use in pseudos for buttons
function createButtonPseudo( type ) {
	return function( elem ) {
		var name = elem.nodeName.toLowerCase();
		return (name === "input" || name === "button") && elem.type === type;
	};
}

// Returns a function to use in pseudos for positionals
function createPositionalPseudo( fn ) {
	return markFunction(function( argument ) {
		argument = +argument;
		return markFunction(function( seed, matches ) {
			var j,
				matchIndexes = fn( [], seed.length, argument ),
				i = matchIndexes.length;

			// Match elements found at the specified indexes
			while ( i-- ) {
				if ( seed[ (j = matchIndexes[i]) ] ) {
					seed[j] = !(matches[j] = seed[j]);
				}
			}
		});
	});
}

/*
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
	var node,
		ret = "",
		i = 0,
		nodeType = elem.nodeType;

	if ( !nodeType ) {
		// If no nodeType, this is expected to be an array
		for ( ; (node = elem[i]); i++ ) {
			// Do not traverse comment nodes
			ret += getText( node );
		}
	} else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
		// Use textContent for elements
		// innerText usage removed for consistency of new lines (see #11153)
		if ( typeof elem.textContent === "string" ) {
			return elem.textContent;
		} else {
			// Traverse its children
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				ret += getText( elem );
			}
		}
	} else if ( nodeType === 3 || nodeType === 4 ) {
		return elem.nodeValue;
	}
	// Do not include comment or processing instruction nodes

	return ret;
};

Expr = Sizzle.selectors = {

	// Can be adjusted by the user
	cacheLength: 50,

	createPseudo: markFunction,

	match: matchExpr,

	find: {},

	relative: {
		">": { dir: "parentNode", first: true },
		" ": { dir: "parentNode" },
		"+": { dir: "previousSibling", first: true },
		"~": { dir: "previousSibling" }
	},

	preFilter: {
		"ATTR": function( match ) {
			match[1] = match[1].replace( runescape, funescape );

			// Move the given value to match[3] whether quoted or unquoted
			match[3] = ( match[4] || match[5] || "" ).replace( runescape, funescape );

			if ( match[2] === "~=" ) {
				match[3] = " " + match[3] + " ";
			}

			return match.slice( 0, 4 );
		},

		"CHILD": function( match ) {
			/* matches from matchExpr["CHILD"]
				1 type (only|nth|...)
				2 what (child|of-type)
				3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
				4 xn-component of xn+y argument ([+-]?\d*n|)
				5 sign of xn-component
				6 x of xn-component
				7 sign of y-component
				8 y of y-component
			*/
			match[1] = match[1].toLowerCase();

			if ( match[1].slice( 0, 3 ) === "nth" ) {
				// nth-* requires argument
				if ( !match[3] ) {
					Sizzle.error( match[0] );
				}

				// numeric x and y parameters for Expr.filter.CHILD
				// remember that false/true cast respectively to 0/1
				match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
				match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

			// other types prohibit arguments
			} else if ( match[3] ) {
				Sizzle.error( match[0] );
			}

			return match;
		},

		"PSEUDO": function( match ) {
			var excess,
				unquoted = !match[5] && match[2];

			if ( matchExpr["CHILD"].test( match[0] ) ) {
				return null;
			}

			// Accept quoted arguments as-is
			if ( match[4] ) {
				match[2] = match[4];

			// Strip excess characters from unquoted arguments
			} else if ( unquoted && rpseudo.test( unquoted ) &&
				// Get excess from tokenize (recursively)
				(excess = tokenize( unquoted, true )) &&
				// advance to the next closing parenthesis
				(excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

				// excess is a negative index
				match[0] = match[0].slice( 0, excess );
				match[2] = unquoted.slice( 0, excess );
			}

			// Return only captures needed by the pseudo filter method (type and argument)
			return match.slice( 0, 3 );
		}
	},

	filter: {

		"TAG": function( nodeName ) {
			if ( nodeName === "*" ) {
				return function() { return true; };
			}

			nodeName = nodeName.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
			};
		},

		"CLASS": function( className ) {
			var pattern = classCache[ className + " " ];

			return pattern ||
				(pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
				classCache( className, function( elem ) {
					return pattern.test( elem.className || (typeof elem.getAttribute !== strundefined && elem.getAttribute("class")) || "" );
				});
		},

		"ATTR": function( name, operator, check ) {
			return function( elem ) {
				var result = Sizzle.attr( elem, name );

				if ( result == null ) {
					return operator === "!=";
				}
				if ( !operator ) {
					return true;
				}

				result += "";

				return operator === "=" ? result === check :
					operator === "!=" ? result !== check :
					operator === "^=" ? check && result.indexOf( check ) === 0 :
					operator === "*=" ? check && result.indexOf( check ) > -1 :
					operator === "$=" ? check && result.slice( -check.length ) === check :
					operator === "~=" ? ( " " + result + " " ).indexOf( check ) > -1 :
					operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
					false;
			};
		},

		"CHILD": function( type, what, argument, first, last ) {
			var simple = type.slice( 0, 3 ) !== "nth",
				forward = type.slice( -4 ) !== "last",
				ofType = what === "of-type";

			return first === 1 && last === 0 ?

				// Shortcut for :nth-*(n)
				function( elem ) {
					return !!elem.parentNode;
				} :

				function( elem, context, xml ) {
					var cache, outerCache, node, diff, nodeIndex, start,
						dir = simple !== forward ? "nextSibling" : "previousSibling",
						parent = elem.parentNode,
						name = ofType && elem.nodeName.toLowerCase(),
						useCache = !xml && !ofType;

					if ( parent ) {

						// :(first|last|only)-(child|of-type)
						if ( simple ) {
							while ( dir ) {
								node = elem;
								while ( (node = node[ dir ]) ) {
									if ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) {
										return false;
									}
								}
								// Reverse direction for :only-* (if we haven't yet done so)
								start = dir = type === "only" && !start && "nextSibling";
							}
							return true;
						}

						start = [ forward ? parent.firstChild : parent.lastChild ];

						// non-xml :nth-child(...) stores cache data on `parent`
						if ( forward && useCache ) {
							// Seek `elem` from a previously-cached index
							outerCache = parent[ expando ] || (parent[ expando ] = {});
							cache = outerCache[ type ] || [];
							nodeIndex = cache[0] === dirruns && cache[1];
							diff = cache[0] === dirruns && cache[2];
							node = nodeIndex && parent.childNodes[ nodeIndex ];

							while ( (node = ++nodeIndex && node && node[ dir ] ||

								// Fallback to seeking `elem` from the start
								(diff = nodeIndex = 0) || start.pop()) ) {

								// When found, cache indexes on `parent` and break
								if ( node.nodeType === 1 && ++diff && node === elem ) {
									outerCache[ type ] = [ dirruns, nodeIndex, diff ];
									break;
								}
							}

						// Use previously-cached element index if available
						} else if ( useCache && (cache = (elem[ expando ] || (elem[ expando ] = {}))[ type ]) && cache[0] === dirruns ) {
							diff = cache[1];

						// xml :nth-child(...) or :nth-last-child(...) or :nth(-last)?-of-type(...)
						} else {
							// Use the same loop as above to seek `elem` from the start
							while ( (node = ++nodeIndex && node && node[ dir ] ||
								(diff = nodeIndex = 0) || start.pop()) ) {

								if ( ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) && ++diff ) {
									// Cache the index of each encountered element
									if ( useCache ) {
										(node[ expando ] || (node[ expando ] = {}))[ type ] = [ dirruns, diff ];
									}

									if ( node === elem ) {
										break;
									}
								}
							}
						}

						// Incorporate the offset, then check against cycle size
						diff -= last;
						return diff === first || ( diff % first === 0 && diff / first >= 0 );
					}
				};
		},

		"PSEUDO": function( pseudo, argument ) {
			// pseudo-class names are case-insensitive
			// http://www.w3.org/TR/selectors/#pseudo-classes
			// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
			// Remember that setFilters inherits from pseudos
			var args,
				fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
					Sizzle.error( "unsupported pseudo: " + pseudo );

			// The user may use createPseudo to indicate that
			// arguments are needed to create the filter function
			// just as Sizzle does
			if ( fn[ expando ] ) {
				return fn( argument );
			}

			// But maintain support for old signatures
			if ( fn.length > 1 ) {
				args = [ pseudo, pseudo, "", argument ];
				return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
					markFunction(function( seed, matches ) {
						var idx,
							matched = fn( seed, argument ),
							i = matched.length;
						while ( i-- ) {
							idx = indexOf.call( seed, matched[i] );
							seed[ idx ] = !( matches[ idx ] = matched[i] );
						}
					}) :
					function( elem ) {
						return fn( elem, 0, args );
					};
			}

			return fn;
		}
	},

	pseudos: {
		// Potentially complex pseudos
		"not": markFunction(function( selector ) {
			// Trim the selector passed to compile
			// to avoid treating leading and trailing
			// spaces as combinators
			var input = [],
				results = [],
				matcher = compile( selector.replace( rtrim, "$1" ) );

			return matcher[ expando ] ?
				markFunction(function( seed, matches, context, xml ) {
					var elem,
						unmatched = matcher( seed, null, xml, [] ),
						i = seed.length;

					// Match elements unmatched by `matcher`
					while ( i-- ) {
						if ( (elem = unmatched[i]) ) {
							seed[i] = !(matches[i] = elem);
						}
					}
				}) :
				function( elem, context, xml ) {
					input[0] = elem;
					matcher( input, null, xml, results );
					return !results.pop();
				};
		}),

		"has": markFunction(function( selector ) {
			return function( elem ) {
				return Sizzle( selector, elem ).length > 0;
			};
		}),

		"contains": markFunction(function( text ) {
			return function( elem ) {
				return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
			};
		}),

		// "Whether an element is represented by a :lang() selector
		// is based solely on the element's language value
		// being equal to the identifier C,
		// or beginning with the identifier C immediately followed by "-".
		// The matching of C against the element's language value is performed case-insensitively.
		// The identifier C does not have to be a valid language name."
		// http://www.w3.org/TR/selectors/#lang-pseudo
		"lang": markFunction( function( lang ) {
			// lang value must be a valid identifier
			if ( !ridentifier.test(lang || "") ) {
				Sizzle.error( "unsupported lang: " + lang );
			}
			lang = lang.replace( runescape, funescape ).toLowerCase();
			return function( elem ) {
				var elemLang;
				do {
					if ( (elemLang = documentIsHTML ?
						elem.lang :
						elem.getAttribute("xml:lang") || elem.getAttribute("lang")) ) {

						elemLang = elemLang.toLowerCase();
						return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
					}
				} while ( (elem = elem.parentNode) && elem.nodeType === 1 );
				return false;
			};
		}),

		// Miscellaneous
		"target": function( elem ) {
			var hash = window.location && window.location.hash;
			return hash && hash.slice( 1 ) === elem.id;
		},

		"root": function( elem ) {
			return elem === docElem;
		},

		"focus": function( elem ) {
			return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
		},

		// Boolean properties
		"enabled": function( elem ) {
			return elem.disabled === false;
		},

		"disabled": function( elem ) {
			return elem.disabled === true;
		},

		"checked": function( elem ) {
			// In CSS3, :checked should return both checked and selected elements
			// http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
			var nodeName = elem.nodeName.toLowerCase();
			return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
		},

		"selected": function( elem ) {
			// Accessing this property makes selected-by-default
			// options in Safari work properly
			if ( elem.parentNode ) {
				elem.parentNode.selectedIndex;
			}

			return elem.selected === true;
		},

		// Contents
		"empty": function( elem ) {
			// http://www.w3.org/TR/selectors/#empty-pseudo
			// :empty is only affected by element nodes and content nodes(including text(3), cdata(4)),
			//   not comment, processing instructions, or others
			// Thanks to Diego Perini for the nodeName shortcut
			//   Greater than "@" means alpha characters (specifically not starting with "#" or "?")
			for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
				if ( elem.nodeName > "@" || elem.nodeType === 3 || elem.nodeType === 4 ) {
					return false;
				}
			}
			return true;
		},

		"parent": function( elem ) {
			return !Expr.pseudos["empty"]( elem );
		},

		// Element/input types
		"header": function( elem ) {
			return rheader.test( elem.nodeName );
		},

		"input": function( elem ) {
			return rinputs.test( elem.nodeName );
		},

		"button": function( elem ) {
			var name = elem.nodeName.toLowerCase();
			return name === "input" && elem.type === "button" || name === "button";
		},

		"text": function( elem ) {
			var attr;
			// IE6 and 7 will map elem.type to 'text' for new HTML5 types (search, etc)
			// use getAttribute instead to test this case
			return elem.nodeName.toLowerCase() === "input" &&
				elem.type === "text" &&
				( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === elem.type );
		},

		// Position-in-collection
		"first": createPositionalPseudo(function() {
			return [ 0 ];
		}),

		"last": createPositionalPseudo(function( matchIndexes, length ) {
			return [ length - 1 ];
		}),

		"eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
			return [ argument < 0 ? argument + length : argument ];
		}),

		"even": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 0;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"odd": createPositionalPseudo(function( matchIndexes, length ) {
			var i = 1;
			for ( ; i < length; i += 2 ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; --i >= 0; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		}),

		"gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
			var i = argument < 0 ? argument + length : argument;
			for ( ; ++i < length; ) {
				matchIndexes.push( i );
			}
			return matchIndexes;
		})
	}
};

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
	Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
	Expr.pseudos[ i ] = createButtonPseudo( i );
}

function tokenize( selector, parseOnly ) {
	var matched, match, tokens, type,
		soFar, groups, preFilters,
		cached = tokenCache[ selector + " " ];

	if ( cached ) {
		return parseOnly ? 0 : cached.slice( 0 );
	}

	soFar = selector;
	groups = [];
	preFilters = Expr.preFilter;

	while ( soFar ) {

		// Comma and first run
		if ( !matched || (match = rcomma.exec( soFar )) ) {
			if ( match ) {
				// Don't consume trailing commas as valid
				soFar = soFar.slice( match[0].length ) || soFar;
			}
			groups.push( tokens = [] );
		}

		matched = false;

		// Combinators
		if ( (match = rcombinators.exec( soFar )) ) {
			matched = match.shift();
			tokens.push( {
				value: matched,
				// Cast descendant combinators to space
				type: match[0].replace( rtrim, " " )
			} );
			soFar = soFar.slice( matched.length );
		}

		// Filters
		for ( type in Expr.filter ) {
			if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
				(match = preFilters[ type ]( match ))) ) {
				matched = match.shift();
				tokens.push( {
					value: matched,
					type: type,
					matches: match
				} );
				soFar = soFar.slice( matched.length );
			}
		}

		if ( !matched ) {
			break;
		}
	}

	// Return the length of the invalid excess
	// if we're just parsing
	// Otherwise, throw an error or return tokens
	return parseOnly ?
		soFar.length :
		soFar ?
			Sizzle.error( selector ) :
			// Cache the tokens
			tokenCache( selector, groups ).slice( 0 );
}

function toSelector( tokens ) {
	var i = 0,
		len = tokens.length,
		selector = "";
	for ( ; i < len; i++ ) {
		selector += tokens[i].value;
	}
	return selector;
}

function addCombinator( matcher, combinator, base ) {
	var dir = combinator.dir,
		checkNonElements = base && dir === "parentNode",
		doneName = done++;

	return combinator.first ?
		// Check against closest ancestor/preceding element
		function( elem, context, xml ) {
			while ( (elem = elem[ dir ]) ) {
				if ( elem.nodeType === 1 || checkNonElements ) {
					return matcher( elem, context, xml );
				}
			}
		} :

		// Check against all ancestor/preceding elements
		function( elem, context, xml ) {
			var data, cache, outerCache,
				dirkey = dirruns + " " + doneName;

			// We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
			if ( xml ) {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						if ( matcher( elem, context, xml ) ) {
							return true;
						}
					}
				}
			} else {
				while ( (elem = elem[ dir ]) ) {
					if ( elem.nodeType === 1 || checkNonElements ) {
						outerCache = elem[ expando ] || (elem[ expando ] = {});
						if ( (cache = outerCache[ dir ]) && cache[0] === dirkey ) {
							if ( (data = cache[1]) === true || data === cachedruns ) {
								return data === true;
							}
						} else {
							cache = outerCache[ dir ] = [ dirkey ];
							cache[1] = matcher( elem, context, xml ) || cachedruns;
							if ( cache[1] === true ) {
								return true;
							}
						}
					}
				}
			}
		};
}

function elementMatcher( matchers ) {
	return matchers.length > 1 ?
		function( elem, context, xml ) {
			var i = matchers.length;
			while ( i-- ) {
				if ( !matchers[i]( elem, context, xml ) ) {
					return false;
				}
			}
			return true;
		} :
		matchers[0];
}

function condense( unmatched, map, filter, context, xml ) {
	var elem,
		newUnmatched = [],
		i = 0,
		len = unmatched.length,
		mapped = map != null;

	for ( ; i < len; i++ ) {
		if ( (elem = unmatched[i]) ) {
			if ( !filter || filter( elem, context, xml ) ) {
				newUnmatched.push( elem );
				if ( mapped ) {
					map.push( i );
				}
			}
		}
	}

	return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
	if ( postFilter && !postFilter[ expando ] ) {
		postFilter = setMatcher( postFilter );
	}
	if ( postFinder && !postFinder[ expando ] ) {
		postFinder = setMatcher( postFinder, postSelector );
	}
	return markFunction(function( seed, results, context, xml ) {
		var temp, i, elem,
			preMap = [],
			postMap = [],
			preexisting = results.length,

			// Get initial elements from seed or context
			elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

			// Prefilter to get matcher input, preserving a map for seed-results synchronization
			matcherIn = preFilter && ( seed || !selector ) ?
				condense( elems, preMap, preFilter, context, xml ) :
				elems,

			matcherOut = matcher ?
				// If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
				postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

					// ...intermediate processing is necessary
					[] :

					// ...otherwise use results directly
					results :
				matcherIn;

		// Find primary matches
		if ( matcher ) {
			matcher( matcherIn, matcherOut, context, xml );
		}

		// Apply postFilter
		if ( postFilter ) {
			temp = condense( matcherOut, postMap );
			postFilter( temp, [], context, xml );

			// Un-match failing elements by moving them back to matcherIn
			i = temp.length;
			while ( i-- ) {
				if ( (elem = temp[i]) ) {
					matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
				}
			}
		}

		if ( seed ) {
			if ( postFinder || preFilter ) {
				if ( postFinder ) {
					// Get the final matcherOut by condensing this intermediate into postFinder contexts
					temp = [];
					i = matcherOut.length;
					while ( i-- ) {
						if ( (elem = matcherOut[i]) ) {
							// Restore matcherIn since elem is not yet a final match
							temp.push( (matcherIn[i] = elem) );
						}
					}
					postFinder( null, (matcherOut = []), temp, xml );
				}

				// Move matched elements from seed to results to keep them synchronized
				i = matcherOut.length;
				while ( i-- ) {
					if ( (elem = matcherOut[i]) &&
						(temp = postFinder ? indexOf.call( seed, elem ) : preMap[i]) > -1 ) {

						seed[temp] = !(results[temp] = elem);
					}
				}
			}

		// Add elements to results, through postFinder if defined
		} else {
			matcherOut = condense(
				matcherOut === results ?
					matcherOut.splice( preexisting, matcherOut.length ) :
					matcherOut
			);
			if ( postFinder ) {
				postFinder( null, results, matcherOut, xml );
			} else {
				push.apply( results, matcherOut );
			}
		}
	});
}

function matcherFromTokens( tokens ) {
	var checkContext, matcher, j,
		len = tokens.length,
		leadingRelative = Expr.relative[ tokens[0].type ],
		implicitRelative = leadingRelative || Expr.relative[" "],
		i = leadingRelative ? 1 : 0,

		// The foundational matcher ensures that elements are reachable from top-level context(s)
		matchContext = addCombinator( function( elem ) {
			return elem === checkContext;
		}, implicitRelative, true ),
		matchAnyContext = addCombinator( function( elem ) {
			return indexOf.call( checkContext, elem ) > -1;
		}, implicitRelative, true ),
		matchers = [ function( elem, context, xml ) {
			return ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
				(checkContext = context).nodeType ?
					matchContext( elem, context, xml ) :
					matchAnyContext( elem, context, xml ) );
		} ];

	for ( ; i < len; i++ ) {
		if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
			matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
		} else {
			matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

			// Return special upon seeing a positional matcher
			if ( matcher[ expando ] ) {
				// Find the next relative operator (if any) for proper handling
				j = ++i;
				for ( ; j < len; j++ ) {
					if ( Expr.relative[ tokens[j].type ] ) {
						break;
					}
				}
				return setMatcher(
					i > 1 && elementMatcher( matchers ),
					i > 1 && toSelector( tokens.slice( 0, i - 1 ) ).replace( rtrim, "$1" ),
					matcher,
					i < j && matcherFromTokens( tokens.slice( i, j ) ),
					j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
					j < len && toSelector( tokens )
				);
			}
			matchers.push( matcher );
		}
	}

	return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
	// A counter to specify which element is currently being matched
	var matcherCachedRuns = 0,
		bySet = setMatchers.length > 0,
		byElement = elementMatchers.length > 0,
		superMatcher = function( seed, context, xml, results, expandContext ) {
			var elem, j, matcher,
				setMatched = [],
				matchedCount = 0,
				i = "0",
				unmatched = seed && [],
				outermost = expandContext != null,
				contextBackup = outermostContext,
				// We must always have either seed elements or context
				elems = seed || byElement && Expr.find["TAG"]( "*", expandContext && context.parentNode || context ),
				// Use integer dirruns iff this is the outermost matcher
				dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1);

			if ( outermost ) {
				outermostContext = context !== document && context;
				cachedruns = matcherCachedRuns;
			}

			// Add elements passing elementMatchers directly to results
			// Keep `i` a string if there are no elements so `matchedCount` will be "00" below
			for ( ; (elem = elems[i]) != null; i++ ) {
				if ( byElement && elem ) {
					j = 0;
					while ( (matcher = elementMatchers[j++]) ) {
						if ( matcher( elem, context, xml ) ) {
							results.push( elem );
							break;
						}
					}
					if ( outermost ) {
						dirruns = dirrunsUnique;
						cachedruns = ++matcherCachedRuns;
					}
				}

				// Track unmatched elements for set filters
				if ( bySet ) {
					// They will have gone through all possible matchers
					if ( (elem = !matcher && elem) ) {
						matchedCount--;
					}

					// Lengthen the array for every element, matched or not
					if ( seed ) {
						unmatched.push( elem );
					}
				}
			}

			// Apply set filters to unmatched elements
			matchedCount += i;
			if ( bySet && i !== matchedCount ) {
				j = 0;
				while ( (matcher = setMatchers[j++]) ) {
					matcher( unmatched, setMatched, context, xml );
				}

				if ( seed ) {
					// Reintegrate element matches to eliminate the need for sorting
					if ( matchedCount > 0 ) {
						while ( i-- ) {
							if ( !(unmatched[i] || setMatched[i]) ) {
								setMatched[i] = pop.call( results );
							}
						}
					}

					// Discard index placeholder values to get only actual matches
					setMatched = condense( setMatched );
				}

				// Add matches to results
				push.apply( results, setMatched );

				// Seedless set matches succeeding multiple successful matchers stipulate sorting
				if ( outermost && !seed && setMatched.length > 0 &&
					( matchedCount + setMatchers.length ) > 1 ) {

					Sizzle.uniqueSort( results );
				}
			}

			// Override manipulation of globals by nested matchers
			if ( outermost ) {
				dirruns = dirrunsUnique;
				outermostContext = contextBackup;
			}

			return unmatched;
		};

	return bySet ?
		markFunction( superMatcher ) :
		superMatcher;
}

compile = Sizzle.compile = function( selector, group /* Internal Use Only */ ) {
	var i,
		setMatchers = [],
		elementMatchers = [],
		cached = compilerCache[ selector + " " ];

	if ( !cached ) {
		// Generate a function of recursive functions that can be used to check each element
		if ( !group ) {
			group = tokenize( selector );
		}
		i = group.length;
		while ( i-- ) {
			cached = matcherFromTokens( group[i] );
			if ( cached[ expando ] ) {
				setMatchers.push( cached );
			} else {
				elementMatchers.push( cached );
			}
		}

		// Cache the compiled function
		cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );
	}
	return cached;
};

function multipleContexts( selector, contexts, results ) {
	var i = 0,
		len = contexts.length;
	for ( ; i < len; i++ ) {
		Sizzle( selector, contexts[i], results );
	}
	return results;
}

function select( selector, context, results, seed ) {
	var i, tokens, token, type, find,
		match = tokenize( selector );

	if ( !seed ) {
		// Try to minimize operations if there is only one group
		if ( match.length === 1 ) {

			// Take a shortcut and set the context if the root selector is an ID
			tokens = match[0] = match[0].slice( 0 );
			if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
					context.nodeType === 9 && documentIsHTML &&
					Expr.relative[ tokens[1].type ] ) {

				context = ( Expr.find["ID"]( token.matches[0].replace(runescape, funescape), context ) || [] )[0];
				if ( !context ) {
					return results;
				}

				selector = selector.slice( tokens.shift().value.length );
			}

			// Fetch a seed set for right-to-left matching
			i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
			while ( i-- ) {
				token = tokens[i];

				// Abort if we hit a combinator
				if ( Expr.relative[ (type = token.type) ] ) {
					break;
				}
				if ( (find = Expr.find[ type ]) ) {
					// Search, expanding context for leading sibling combinators
					if ( (seed = find(
						token.matches[0].replace( runescape, funescape ),
						rsibling.test( tokens[0].type ) && context.parentNode || context
					)) ) {

						// If seed is empty or no tokens remain, we can return early
						tokens.splice( i, 1 );
						selector = seed.length && toSelector( tokens );
						if ( !selector ) {
							push.apply( results, seed );
							return results;
						}

						break;
					}
				}
			}
		}
	}

	// Compile and execute a filtering function
	// Provide `match` to avoid retokenization if we modified the selector above
	compile( selector, match )(
		seed,
		context,
		!documentIsHTML,
		results,
		rsibling.test( selector )
	);
	return results;
}

// Deprecated
Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

// Check sort stability
support.sortStable = expando.split("").sort( sortOrder ).join("") === expando;

// Initialize with the default document
setDocument();

// Always assume the presence of duplicates if sort doesn't
// pass them to our comparison function (as in Google Chrome).
[0, 0].sort( sortOrder );
support.detectDuplicates = hasDuplicate;

// EXPOSE
/*if ( typeof define === "function" && define.amd ) {
	define(function() { return Sizzle; });
} else {
	window.Sizzle = Sizzle;
}*/
// EXPOSE

/**
 * @namespace Ink.Dom.Selector
 * @static
 */

/**
 * Alias for the Sizzle selector engine
 *
 * @method select
 * @param {String}      selector    CSS selector to search for elements
 * @param {DOMElement}  [context]   By default the search is done in the document element. However, you can specify an element as search context
 * @param {Array}       [results]   By default this is considered an empty array. But if you want to merge it with other searches you did, pass their result array through here.
 * @return {Array} Array of resulting DOM Elements
 * @sample Ink_Dom_Selector_select.html
 */

/**
 * Filters elements that match a CSS selector.
 *
 * @method matches
 * @param {String}  selector    CSS selector to search for elements
 * @param {Array}   matches     Elements to be 'matched' with
 * @return {Array} Elements that matched
 * @sample Ink_Dom_Selector_matches.html
 */

/**
 * Checks if an element matches a given selector
 *
 * @method matchesSelector
 * @param {DOMElement} element Element to test
 * @param {String}     selector CSS selector to test the element with
 * @return {Boolean} True if element matches the CSS selector
 * @sample Ink_Dom_Selector_matchesSelector.html 
 */

return {
    select:          Sizzle,
    matches:         Sizzle.matches,
    matchesSelector: Sizzle.matchesSelector
};


}); //( window );

/**
 * Array Utilities
 * @module Ink.Util.Array_1
 * @version 1
 */

Ink.createModule('Ink.Util.Array', '1', [], function() {

    'use strict';

    var arrayProto = Array.prototype;

    /**
     * @namespace Ink.Util.Array_1
     */

    var InkArray = {

        /**
         * Checks if a value exists in array
         *
         * @method inArray
         * @public
         * @static
         * @param {Mixed} value     Value to check
         * @param {Array} arr       Array to search in
         * @return {Boolean}        True if value exists in the array
         * @sample Ink_Util_Array_inArray.html 
         */
        inArray: function(value, arr) {
            if (typeof arr === 'object') {
                for (var i = 0, f = arr.length; i < f; ++i) {
                    if (arr[i] === value) {
                        return true;
                    }
                }
            }
            return false;
        },

        /**
         * Sorts an array of objects by an object property
         *
         * @method sortMulti
         * @param {Array}           arr         Array of objects to sort
         * @param {String}  key         Property to sort by
         * @return {Array|Boolean}      False if it's not an array, returns a sorted array if it's an array.
         * @public
         * @static
         * @sample Ink_Util_Array_sortMulti.html 
         */
        sortMulti: function(arr, key) {
            if (typeof arr === 'undefined' || arr.constructor !== Array) { return false; }
            if (typeof key !== 'string') { return arr.sort(); }
            if (arr.length > 0) {
                if (typeof(arr[0][key]) === 'undefined') { return false; }
                arr.sort(function(a, b){
                    var x = a[key];
                    var y = b[key];
                    return ((x < y) ? -1 : ((x > y) ? 1 : 0));
                });
            }
            return arr;
        },

        /**
         * Gets the indexes of a value in an array
         *
         * @method keyValue
         * @param   {String}      value     Value to search for.
         * @param   {Array}       arr       Array to run the search in.
         * @param   {Boolean}     [first]   Flag to stop the search at the first match. It also returns an index number instead of an array of indexes.
         * @return  {Boolean|Number|Array}  False for no matches. Array of matches or first match index.
         * @public
         * @static
         * @sample Ink_Util_Array_keyValue.html 
         */
        keyValue: function(value, arr, first) {
            if (typeof value !== 'undefined' && typeof arr === 'object' && this.inArray(value, arr)) {
                var aKeys = [];
                for (var i = 0, f = arr.length; i < f; ++i) {
                    if (arr[i] === value) {
                        if (typeof first !== 'undefined' && first === true) {
                            return i;
                        } else {
                            aKeys.push(i);
                        }
                    }
                }
                return aKeys;
            }
            return false;
        },

        /**
         * Shuffles an array.
         *
         * @method shuffle
         * @param   {Array}       arr    Array to shuffle
         * @return  {Array|Boolean}      Shuffled Array or false if not an array.
         * @public
         * @static
         * @sample Ink_Util_Array_shuffle.html 
         */
        shuffle: function(arr) {
            if (typeof(arr) !== 'undefined' && arr.constructor !== Array) { return false; }
            var total   = arr.length,
                tmp1    = false,
                rnd     = false;

            while (total--) {
                rnd        = Math.floor(Math.random() * (total + 1));
                tmp1       = arr[total];
                arr[total] = arr[rnd];
                arr[rnd]   = tmp1;
            }
            return arr;
        },

        /**
         * Runs a function through each of the elements of an array
         *
         * @method forEach
         * @param   {Array}     arr     The array to be cycled/iterated
         * @param   {Function}  cb      The function receives as arguments the value, index and array.
         * @return  {Array}             Iterated array.
         * @public
         * @static
         * @sample Ink_Util_Array_forEach.html 
         */
        forEach: function(array, callback, context) {
            if (arrayProto.forEach) {
                return arrayProto.forEach.call(array, callback, context);
            }
            for (var i = 0, len = array.length >>> 0; i < len; i++) {
                callback.call(context, array[i], i, array);
            }
        },

        /**
         * Alias for backwards compatibility. See forEach
         *
         * @method each
         */
        each: function () {
            InkArray.forEach.apply(InkArray, [].slice.call(arguments));
        },

        /**
         * Runs a function for each item in the array. 
         * That function will receive each item as an argument and its return value will change the corresponding array item.
         * @method map
         * @param {Array}       array       The array to map over
         * @param {Function}    map         The map function. Will take `(item, index, array)` as arguments and `this` will be the `context` argument.
         * @param {Object}      [context]   Object to be `this` in the map function. 
         *
         * @sample Ink_Util_Array_map.html 
         */
        map: function (array, callback, context) {
            if (arrayProto.map) {
                return arrayProto.map.call(array, callback, context);
            }
            var mapped = new Array(len);
            for (var i = 0, len = array.length >>> 0; i < len; i++) {
                mapped[i] = callback.call(context, array[i], i, array);
            }
            return mapped;
        },

        /**
         * Filters an array based on a truth test.
         * This method runs a test function on all the array values and returns a new array with all the values that pass the test.
         * @method filter
         * @param {Array}       array       The array to filter
         * @param {Function}    test        A test function taking `(item, index, array)`
         * @param {Object}      [context]   Object to be `this` in the test function.
         * @return {Array}                  Returns the filtered array
         *
         * @sample Ink_Util_Array_filter.html 
         */
        filter: function (array, test, context) {
            if (arrayProto.filter) {
                return arrayProto.filter.call(array, test, context);
            }
            var filtered = [],
                val = null;
            for (var i = 0, len = array.length; i < len; i++) {
                val = array[i]; // it might be mutated
                if (test.call(context, val, i, array)) {
                    filtered.push(val);
                }
            }
            return filtered;
        },

        /**
         * Checks if some element in the array passes a truth test
         *
         * @method some
         * @param   {Array}       arr       The array to iterate through
         * @param   {Function}    cb        The callback to be called on the array's elements. It receives the value, the index and the array as arguments.
         * @param   {Object}      context   Object of the callback function
         * @return  {Boolean}               True if the callback returns true at any point, false otherwise
         * @public
         * @static
         * @sample Ink_Util_Array_some.html 
         */
        some: function(arr, cb, context){

            if (arr === null){
                throw new TypeError('First argument is invalid.');
            }

            var t = Object(arr);
            var len = t.length >>> 0;
            if (typeof cb !== "function"){ throw new TypeError('Second argument must be a function.'); }

            for (var i = 0; i < len; i++) {
                if (i in t && cb.call(context, t[i], i, t)){ return true; }
            }

            return false;
        },

        /**
         * Compares the values of two arrays and return the matches
         *
         * @method intersect
         * @param   {Array}   arr1      First array
         * @param   {Array}   arr2      Second array
         * @return  {Array}             Empty array if one of the arrays is false (or do not intersect) | Array with the intersected values
         * @public
         * @static
         * @sample Ink_Util_Array_intersect.html 
         */
        intersect: function(arr1, arr2) {
            if (!arr1 || !arr2 || arr1 instanceof Array === false || arr2 instanceof Array === false) {
                return [];
            }

            var shared = [];
            for (var i = 0, I = arr1.length; i<I; ++i) {
                for (var j = 0, J = arr2.length; j < J; ++j) {
                    if (arr1[i] === arr2[j]) {
                        shared.push(arr1[i]);
                    }
                }
            }

            return shared;
        },

        /**
         * Converts an array-like object to an array
         *
         * @method convert
         * @param   {Array}   arr   Array to be converted
         * @return  {Array}         Array resulting of the conversion
         * @public
         * @static
         * @sample Ink_Util_Array_convert.html 
         */
        convert: function(arr) {
            return arrayProto.slice.call(arr || [], 0);
        },

        /**
         * Inserts a value on a specified index
         *
         * @method insert
         * @param {Array}   arr     Array where the value will be inserted
         * @param {Number}  idx     Index of the array where the value should be inserted
         * @param {Mixed}   value   Value to be inserted
         * @public
         * @static
         * @sample Ink_Util_Array_insert.html 
         */
        insert: function(arr, idx, value) {
            arr.splice(idx, 0, value);
        },

        /**
         * Removes a range of values from the array
         *
         * @method remove
         * @param   {Array}     arr     Array where the value will be removed
         * @param   {Number}    from    Index of the array where the removal will start removing.
         * @param   {Number}    rLen    Number of items to be removed from the index onwards.
         * @return  {Array}             An array with the remaining values
         * @public
         * @static
         * @sample Ink_Util_Array_remove.html 
         */
        remove: function(arr, from, rLen){
            var output = [];

            for(var i = 0, iLen = arr.length; i < iLen; i++){
                if(i >= from && i < from + rLen){
                    continue;
                }

                output.push(arr[i]);
            }

            return output;
        }
    };

    return InkArray;

});

/**
 * Binary Packing algorithm implementation
 * @module Ink.Util.BinPack_1
 * @version 1
 */

Ink.createModule('Ink.Util.BinPack', '1', [], function() {

    'use strict';

    /*jshint boss:true */

    // https://github.com/jakesgordon/bin-packing/

    /*
        Copyright (c) 2011, 2012, 2013 Jake Gordon and contributors

        Permission is hereby granted, free of charge, to any person obtaining a copy
        of this software and associated documentation files (the "Software"), to deal
        in the Software without restriction, including without limitation the rights
        to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
        copies of the Software, and to permit persons to whom the Software is
        furnished to do so, subject to the following conditions:

        The above copyright notice and this permission notice shall be included in all
        copies or substantial portions of the Software.

        THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
        IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
        FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
        AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
        LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
        OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
        SOFTWARE.
    */



    var Packer = function(w, h) {
        this.init(w, h);
    };

    Packer.prototype = {

        init: function(w, h) {
            this.root = { x: 0, y: 0, w: w, h: h };
        },

        fit: function(blocks) {
            var n, node, block;
            for (n = 0; n < blocks.length; ++n) {
                block = blocks[n];
                if (node = this.findNode(this.root, block.w, block.h)) {
                    block.fit = this.splitNode(node, block.w, block.h);
                }
            }
        },

        findNode: function(root, w, h) {
            if (root.used) {
                return this.findNode(root.right, w, h) || this.findNode(root.down, w, h);
            }
            else if ((w <= root.w) && (h <= root.h)) {
                return root;
            }
            else {
                return null;
            }
        },

        splitNode: function(node, w, h) {
            node.used = true;
            node.down  = { x: node.x,     y: node.y + h, w: node.w,     h: node.h - h };
            node.right = { x: node.x + w, y: node.y,     w: node.w - w, h: h          };
            return node;
        }

    };



    var GrowingPacker = function() {};

    GrowingPacker.prototype = {

        fit: function(blocks) {
            var n, node, block, len = blocks.length;
            var w = len > 0 ? blocks[0].w : 0;
            var h = len > 0 ? blocks[0].h : 0;
            this.root = { x: 0, y: 0, w: w, h: h };
            for (n = 0; n < len ; n++) {
                block = blocks[n];
                if (node = this.findNode(this.root, block.w, block.h)) {
                    block.fit = this.splitNode(node, block.w, block.h);
                }
                else {
                    block.fit = this.growNode(block.w, block.h);
                }
            }
        },

        findNode: function(root, w, h) {
            if (root.used) {
                return this.findNode(root.right, w, h) || this.findNode(root.down, w, h);
            }
            else if ((w <= root.w) && (h <= root.h)) {
                return root;
            }
            else {
                return null;
            }
        },

        splitNode: function(node, w, h) {
            node.used = true;
            node.down  = { x: node.x,     y: node.y + h, w: node.w,     h: node.h - h };
            node.right = { x: node.x + w, y: node.y,     w: node.w - w, h: h          };
            return node;
        },

        growNode: function(w, h) {
            var canGrowDown  = (w <= this.root.w);
            var canGrowRight = (h <= this.root.h);

            var shouldGrowRight = canGrowRight && (this.root.h >= (this.root.w + w)); // attempt to keep square-ish by growing right when height is much greater than width
            var shouldGrowDown  = canGrowDown  && (this.root.w >= (this.root.h + h)); // attempt to keep square-ish by growing down  when width  is much greater than height

            if (shouldGrowRight) {
                return this.growRight(w, h);
            }
            else if (shouldGrowDown) {
                return this.growDown(w, h);
            }
            else if (canGrowRight) {
                return this.growRight(w, h);
            }
            else if (canGrowDown) {
                return this.growDown(w, h);
            }
            else {
                return null; // need to ensure sensible root starting size to avoid this happening
            }
        },

        growRight: function(w, h) {
            this.root = {
                used: true,
                x: 0,
                y: 0,
                w: this.root.w + w,
                h: this.root.h,
                down: this.root,
                right: { x: this.root.w, y: 0, w: w, h: this.root.h }
            };
            var node;
            if (node = this.findNode(this.root, w, h)) {
                return this.splitNode(node, w, h);
            }
            else {
                return null;
            }
        },

        growDown: function(w, h) {
            this.root = {
                used: true,
                x: 0,
                y: 0,
                w: this.root.w,
                h: this.root.h + h,
                down:  { x: 0, y: this.root.h, w: this.root.w, h: h },
                right: this.root
            };
            var node;
            if (node = this.findNode(this.root, w, h)) {
                return this.splitNode(node, w, h);
            }
            else {
                return null;
            }
        }

    };



    var sorts = {
        random:  function() { return Math.random() - 0.5; },
        w:       function(a, b) { return b.w - a.w; },
        h:       function(a, b) { return b.h - a.h; },
        a:       function(a, b) { return b.area - a.area; },
        max:     function(a, b) { return Math.max(b.w, b.h) - Math.max(a.w, a.h); },
        min:     function(a, b) { return Math.min(b.w, b.h) - Math.min(a.w, a.h); },
        height:  function(a, b) { return sorts.msort(a, b, ['h', 'w']);               },
        width:   function(a, b) { return sorts.msort(a, b, ['w', 'h']);               },
        area:    function(a, b) { return sorts.msort(a, b, ['a', 'h', 'w']);          },
        maxside: function(a, b) { return sorts.msort(a, b, ['max', 'min', 'h', 'w']); },
        msort:   function(a, b, criteria) { /* sort by multiple criteria */
            var diff, n;
            for (n = 0; n < criteria.length; ++n) {
                diff = sorts[ criteria[n] ](a, b);
                if (diff !== 0) {
                    return diff;
                }
            }
            return 0;
        }
    };



    // end of Jake's code



    // aux, used to display blocks in unfitted property
    var toString = function() {
      return [this.w, ' x ', this.h].join('');
    };



    /**
     * Binary Packing algorithm implementation
     *
     * Based on the work of Jake Gordon
     *
     * see https://github.com/jakesgordon/bin-packing/
     *
     * @namespace Ink.Util.BinPack
     * @version 1
     * @static
     */
    var BinPack = {

        /**
        * @method binPack
        * @param {Object}       o               Options
        * @param {Array}        o.blocks        Array of items with width and height integer attributes.
        * @param {Array}        [o.dimensions]  Flag to fix container dimensions
        * @param {String}       [o.sorter]      Sorting function. One of: random, height, width, area, maxside
        * @return {Object}                      Returns an object containing container dimensions, filled ratio, fitted blocks, unfitted blocks and all blocks
        * @static
        */
        binPack: function(o) {
            var i, f, bl;



            // calculate area if not there already
            for (i = 0, f = o.blocks.length; i < f; ++i) {
                bl = o.blocks[i];
                if (! ('area' in bl) ) {
                    bl.area = bl.w * bl.h;
                }
            }



            // apply algorithm
            var packer = o.dimensions ? new Packer(o.dimensions[0], o.dimensions[1]) : new GrowingPacker();

            if (!o.sorter) { o.sorter = 'maxside'; }

            o.blocks.sort( sorts[ o.sorter ] );

            packer.fit(o.blocks);

            var dims2 = [packer.root.w, packer.root.h];



            // layout is done here, generating report data...
            var fitted   = [];
            var unfitted = [];

            for (i = 0, f = o.blocks.length; i < f; ++i) {
                bl = o.blocks[i];
                if (bl.fit) {
                    fitted.push(bl);
                }
                else {
                    bl.toString = toString; // TO AID SERIALIZATION
                    unfitted.push(bl);
                }
            }

            var area = dims2[0] * dims2[1];
            var fit = 0;
            for (i = 0, f = fitted.length; i < f; ++i) {
                bl = fitted[i];
                fit += bl.area;
            }

            return {
                dimensions: dims2,
                filled:     fit / area,
                blocks:     o.blocks,
                fitted:     fitted,
                unfitted:   unfitted
            };
        }
    };



    return BinPack;

});
/**
 * Cookie Utilities
 * @module Ink.Util.Cookie_1
 * @version 1
 */

Ink.createModule('Ink.Util.Cookie', '1', [], function() {

    'use strict';

    /**
     * @namespace Ink.Util.Cookie_1
     */
    var Cookie = {

        /**
         * Gets an object with the current page cookies.
         *
         * @method get
         * @param   {String}          name      The cookie name.
         * @return  {String|Object}             If the name is specified, it returns the value of that key. Otherwise it returns the full cookie object
         * @public
         * @static
         * @sample Ink_Util_Cookie_get.html
         */
        get: function(name)
        {
            var cookie = document.cookie || false;

            var _Cookie = {};
            if(cookie) {
                cookie = cookie.replace(new RegExp("; ", "g"), ';');
                var aCookie = cookie.split(';');
                var aItem = [];
                if(aCookie.length > 0) {
                    for(var i=0; i < aCookie.length; i++) {
                        aItem = aCookie[i].split('=');
                        if(aItem.length === 2) {
                            _Cookie[aItem[0]] = decodeURIComponent(aItem[1]);
                        }
                        aItem = [];
                    }
                }
            }
            if(name) {
                if(typeof(_Cookie[name]) !== 'undefined') {
                    return _Cookie[name];
                } else {
                    return null;
                }
            }
            return _Cookie;
        },

        /**
         * Sets a cookie.
         *
         * @method set
         * @param {String}      name        Cookie name.
         * @param {String}      value       Cookie value.
         * @param {Number}      [expires]   Number of seconds the cookie will be valid for.
         * @param {String}      [path]      Path for the cookie. Defaults to '/'.
         * @param {String}      [domain]    Domain for the cookie. Defaults to current hostname.
         * @param {Boolean}     [secure]    Flag for secure. Default 'false'.
         * @public
         * @static
         * @sample Ink_Util_Cookie_set.html
         */
        set: function(name, value, expires, path, domain, secure)
        {
            var sName;
            if(!name || value===false || typeof(name) === 'undefined' || typeof(value) === 'undefined') {
                return false;
            } else {
                sName = name+'='+encodeURIComponent(value);
            }
            var sExpires = false;
            var sPath = false;
            var sDomain = false;
            var sSecure = false;

            if(expires && typeof(expires) !== 'undefined' && !isNaN(expires)) {
                var oDate = new Date();
                var sDate = (parseInt(Number(oDate.valueOf()), 10) + (Number(parseInt(expires, 10)) * 1000));

                var nDate = new Date(sDate);
                var expiresString = nDate.toGMTString();

                var re = new RegExp("([^\\s]+)(\\s\\d\\d)\\s(\\w\\w\\w)\\s(.*)");
                expiresString = expiresString.replace(re, "$1$2-$3-$4");

                sExpires = 'expires='+expiresString;
            } else {
                if(typeof(expires) !== 'undefined' && !isNaN(expires) && Number(parseInt(expires, 10))===0) {
                    sExpires = '';
                } else {
                    sExpires = 'expires=Thu, 01-Jan-2037 00:00:01 GMT';
                }
            }

            if(path && typeof(path) !== 'undefined') {
                sPath = 'path='+path;
            } else {
                sPath = 'path=/';
            }

            if(domain && typeof(domain) !== 'undefined') {
                sDomain = 'domain='+domain;
            } else {
                var portClean = new RegExp(":(.*)");
                sDomain = 'domain='+window.location.host;
                sDomain = sDomain.replace(portClean,"");
            }

            if(secure && typeof(secure) !== 'undefined') {
                sSecure = secure;
            } else {
                sSecure = false;
            }

            document.cookie = sName+'; '+sExpires+'; '+sPath+'; '+sDomain+'; '+sSecure;
        },

        /**
         * Deletes a cookie.
         *
         * @method remove
         * @param {String}  cookieName   Cookie name.
         * @param {String}  [path]       Path of the cookie. Defaults to '/'.
         * @param {String}  [domain]     Domain of the cookie. Defaults to current hostname.
         * @public
         * @static
         * @sample Ink_Util_Cookie_remove.html
         */
        remove: function(cookieName, path, domain)
        {
            //var expiresDate = 'Thu, 01-Jan-1970 00:00:01 GMT';
            var sPath = false;
            var sDomain = false;
            var expiresDate = -999999999;

            if(path && typeof(path) !== 'undefined') {
                sPath = path;
            } else {
                sPath = '/';
            }

            if(domain && typeof(domain) !== 'undefined') {
                sDomain = domain;
            } else {
                sDomain = window.location.host;
            }

            this.set(cookieName, 'deleted', expiresDate, sPath, sDomain);
        }
    };

    return Cookie;

});

/**
 * Date utility functions
 * @module Ink.Util.Date_1
 * @version 1
 */

Ink.createModule('Ink.Util.Date', '1', [], function() {

    'use strict';

    /**
     * @namespace Ink.Util.Date_1 
     */
    var InkDate = {

        /**
         * Function that returns the string representation of the month [PT only]
         *
         * @method _months
         * @param {Number} index Month javascript (0 to 11)
         * @return {String} The month's name
         * @private
         * @static
         * @example
         *     console.log( InkDate._months(0) ); // Result: Janeiro
         */
        _months: function(index){
            var _m = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
            return _m[index];
        },

        /**
         * Function that returns the month [PT only] ( 0 to 11 )
         *
         * @method _iMonth
         * @param {String} month Month javascript (0 to 11)
         * @return {Number} The month's number
         * @private
         * @static
         * @example
         *     console.log( InkDate._iMonth('maio') ); // Result: 4
         */
        _iMonth : function( month )
        {
            if ( Number( month ) ) { return +month - 1; }
            return {
                'janeiro'   : 0  ,
                'jan'       : 0  ,
                'fevereiro' : 1  ,
                'fev'       : 1  ,
                'março'     : 2  ,
                'mar'       : 2  ,
                'abril'     : 3  ,
                'abr'       : 3  ,
                'maio'      : 4  ,
                'mai'       : 4  ,
                'junho'     : 5  ,
                'jun'       : 5  ,
                'julho'     : 6  ,
                'jul'       : 6  ,
                'agosto'    : 7  ,
                'ago'       : 7  ,
                'setembro'  : 8  ,
                'set'       : 8  ,
                'outubro'   : 9  ,
                'out'       : 9  ,
                'novembro'  : 10 ,
                'nov'       : 10 ,
                'dezembro'  : 11 ,
                'dez'       : 11
            }[ month.toLowerCase( ) ];
        } ,

        /**
         * Function that returns the representation the day of the week [PT Only]
         *
         * @method _wDays
         * @param {Number} index Week's day index
         * @return {String} The week's day name
         * @private
         * @static
         * @example
         *     console.log( InkDate._wDays(0) ); // Result: Domingo
         */
        _wDays: function(index){
            var _d = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
            return _d[index];
        },

        /**
         * Function that returns day of the week in javascript 1 to 7
         *
         * @method _iWeek
         * @param {String} week Week's day name
         * @return {Number} The week's day index
         * @private
         * @static
         * @example
         *     console.log( InkDate._iWeek('quarta') ); // Result: 3
         */
        _iWeek: function( week )
        {
            if ( Number( week ) ) { return +week || 7; }
            return {
                'segunda' : 1  ,
                'seg'     : 1  ,
                'terça'   : 2  ,
                'ter'     : 2  ,
                'quarta'  : 3  ,
                'qua'     : 3  ,
                'quinta'  : 4  ,
                'qui'     : 4  ,
                'sexta'   : 5  ,
                'sex'     : 5  ,
                'sábado'  : 6  ,
                'sáb'     : 6  ,
                'domingo' : 7  ,
                'dom'     : 7
            }[ week.toLowerCase( ) ];
        },

        /**
         * Function that returns the number of days of a given month (m) on a given year (y)
         *
         * @method _daysInMonth
         * @param {Number} _m Month
         * @param {Number} _y Year
         * @return {Number} Number of days of a give month on a given year
         * @private
         * @static
         * @example
         *     console.log( InkDate._daysInMonth(2,2013) ); // Result: 28
         */
        _daysInMonth: function(_m,_y){
            var nDays;

            if(_m===1 || _m===3 || _m===5 || _m===7 || _m===8 || _m===10 || _m===12)
            {
                nDays= 31;
            }
            else if ( _m===4 || _m===6 || _m===9 || _m===11)
            {
                nDays = 30;
            }
            else
            {
                if((_y%400===0) || (_y%4===0 && _y%100!==0))
                {
                    nDays = 29;
                }
                else
                {
                    nDays = 28;
                }
            }
            return nDays;
        },

        /**
         * Formats a date object.
         * This works exactly as php date() function. http://php.net/manual/en/function.date.php
         *
         * @method get
         * @param   {String}      format    The format in which the date it will be formatted.
         * @param   {Date}        [_date]   The date to format. Can receive unix timestamp or a date object. Defaults to current time.
         * @return  {String}                Formatted date
         * @public
         * @static
         * @sample Ink_Util_Date_get.html 
         */
        get: function(format, _date){
            /*jshint maxcomplexity:65 */
            if(typeof(format) === 'undefined' || format === ''){
                format = "Y-m-d";
            }


            var iFormat = format.split("");
            var result = new Array(iFormat.length);
            var escapeChar = "\\";
            var jsDate;

        if (typeof(_date) === 'undefined'){
            jsDate = new Date();
        } else if (typeof(_date)==='number'){
            jsDate = new Date(_date*1000);
        } else {
            jsDate = new Date(_date);
        }

        var jsFirstDay, jsThisDay, jsHour;
        /* This switch is presented in the same order as in php date function (PHP 5.2.2) */
        for (var i = 0; i < iFormat.length; i++) {
           switch(iFormat[i]) {
                case escapeChar:
                    result[i] = iFormat[i+1];
                    i++;
                    break;


                /* DAY */
                case "d":   /* Day of the month, 2 digits with leading zeros; ex: 01 to 31  */
                    var jsDay = jsDate.getDate();
                    result[i] = (String(jsDay).length > 1) ? jsDay : "0" + jsDay;
                    break;

                case "D":   /* A textual representation of a day, three letters; Seg to Dom */
                    result[i] = this._wDays(jsDate.getDay()).substring(0, 3);
                    break;

                case "j":  /* Day of the month without leading zeros; ex: 1 to 31  */
                    result[i] = jsDate.getDate();
                    break;

                case "l":   /* A full textual representation of the day of the week; Domingo to Sabado  */
                    result[i] = this._wDays(jsDate.getDay());
                    break;

                case "N":  /* ISO-8601 numeric representation of the day of the week; 1 (Segunda) to 7 (Domingo)  */
                    result[i] = jsDate.getDay() || 7;
                    break;

                case "S":  /* English ordinal suffix for the day of the month, 2 characters; st, nd, rd or th. Works well with j */
                    var temp     = jsDate.getDate();
                    var suffixes = ["st", "nd", "rd"];
                    var suffix   = "";

                    if (temp >= 11 && temp <= 13) {
                        result[i] = "th";
                    } else {
                        result[i]  = (suffix = suffixes[String(temp).substr(-1) - 1]) ? (suffix) : ("th");
                    }
                    break;

                case "w":    /* Numeric representation of the day of the week; 0 (for Sunday) through 6 (for Saturday) */
                    result[i] = jsDate.getDay();
                    break;

                case "z":    /* The day of the year (starting from 0); 0 to 365 */
                    jsFirstDay = Date.UTC(jsDate.getFullYear(), 0, 0);
                    jsThisDay = Date.UTC(jsDate.getFullYear(), jsDate.getMonth(), jsDate.getDate());
                    result[i] = Math.floor((jsThisDay - jsFirstDay) / (1000 * 60 * 60 * 24));
                    break;

                /* WEEK */
                case "W":    /* ISO-8601 week number of year, weeks starting on Monday; ex: 42 (the 42nd week in the year)  */
                    var jsYearStart = new Date( jsDate.getFullYear( ) , 0 , 1 );
                    jsFirstDay = jsYearStart.getDay() || 7;

                    var days = Math.floor( ( jsDate - jsYearStart ) / ( 24 * 60 * 60 * 1000 ) + 1 );

                    result[ i ] = Math.ceil( ( days - ( 8 - jsFirstDay ) ) / 7 ) + 1;
                    break;


                /* MONTH */
                case "F":   /* A full textual representation of a month, such as Janeiro or Marco; Janeiro a Dezembro */
                    result[i] = this._months(jsDate.getMonth());
                    break;

                case "m":   /* Numeric representation of a month, with leading zeros; 01 to 12  */
                    var jsMonth = String(jsDate.getMonth() + 1);
                    result[i] = (jsMonth.length > 1) ? jsMonth : "0" + jsMonth;
                    break;

                case "M":   /* A short textual representation of a month, three letters; Jan a Dez */
                    result[i] = this._months(jsDate.getMonth()).substring(0,3);
                    break;

                case "n":   /* Numeric representation of a month, without leading zeros; 1 a 12  */
                    result[i] = jsDate.getMonth() + 1;
                    break;

                case "t":   /* Number of days in the given month; ex: 28 */
                    result[i] = this._daysInMonth(jsDate.getMonth()+1,jsDate.getYear());
                    break;

                /* YEAR */
                case "L":   /* Whether it's a leap year; 1 if it is a leap year, 0 otherwise.  */
                    var jsYear = jsDate.getFullYear();
                    result[i] = (jsYear % 4) ? false : ( (jsYear % 100) ?  true : ( (jsYear % 400) ? false : true  ) );
                    break;

                case "o":  /* ISO-8601 year number. This has the same value as Y, except that if the ISO week number (W) belongs to the previous or next year, that year is used instead.  */
                    throw '"o" not implemented!';

                case "Y":  /* A full numeric representation of a year, 4 digits; 1999  */
                    result[i] = jsDate.getFullYear();
                    break;

                case "y":  /* A two digit representation of a year; 99  */
                    result[i] = String(jsDate.getFullYear()).substring(2);
                    break;

                /* TIME */
                case "a":   /* Lowercase Ante meridiem and Post meridiem; am or pm */
                    result[i] = (jsDate.getHours() < 12) ? "am" : "pm";
                    break;

                case "A":   /* Uppercase Ante meridiem and Post meridiem; AM or PM  */
                    result[i] = (jsDate.getHours < 12) ? "AM" : "PM";
                    break;

                case "B":  /* Swatch Internet time; 000 through 999  */
                    throw '"B" not implemented!';

                case "g":   /* 12-hour format of an hour without leading zeros;  1 to 12 */
                    jsHour = jsDate.getHours();
                    result[i] = (jsHour <= 12) ? jsHour : (jsHour - 12);
                    break;

                case "G":   /* 24-hour format of an hour without leading zeros; 1 to 23 */
                    result[i] = String(jsDate.getHours());
                    break;

                case "h":   /* 12-hour format of an hour with leading zeros; 01 to 12 */
                    jsHour = String(jsDate.getHours());
                    jsHour = (jsHour <= 12) ? jsHour : (jsHour - 12);
                    result[i] = (jsHour.length > 1) ? jsHour : "0" + jsHour;
                    break;

                case "H":   /* 24-hour format of an hour with leading zeros; 01 to 24 */
                    jsHour = String(jsDate.getHours());
                    result[i] = (jsHour.length > 1) ? jsHour : "0" + jsHour;
                    break;

                case "i":   /* Minutes with leading zeros; 00 to 59 */
                    var jsMinute  = String(jsDate.getMinutes());
                    result[i] = (jsMinute.length > 1) ? jsMinute : "0" + jsMinute;
                    break;

                case "s":   /* Seconds with leading zeros; 00 to 59; */
                    var jsSecond  = String(jsDate.getSeconds());
                    result[i]  = (jsSecond.length > 1) ? jsSecond : "0" + jsSecond;
                    break;

                case "u":  /* Microseconds */
                    throw '"u" not implemented!';


                /* TIMEZONE */

                case "e": /* Timezone identifier  */
                    throw '"e" not implemented!';

                case "I":   /*  "1" if Daylight Savings Time, "0" otherwise. Works only on the northern hemisphere */
                    jsFirstDay = new Date(jsDate.getFullYear(), 0, 1);
                    result[i] = (jsDate.getTimezoneOffset() !== jsFirstDay.getTimezoneOffset()) ? (1) : (0);
                    break;

                case "O":  /* Difference to Greenwich time (GMT) in hours */
                    var jsMinZone = jsDate.getTimezoneOffset();
                    var jsMinutes = jsMinZone % 60;
                    jsHour = String(((jsMinZone - jsMinutes) / 60) * -1);

                    if (jsHour.charAt(0) !== "-") {
                        jsHour = "+" + jsHour;
                    }

                    jsHour = (jsHour.length === 3) ? (jsHour) : (jsHour.replace(/([+\-])(\d)/, "$1" + 0 + "$2"));
                    result[i]  = jsHour + jsMinutes + "0";
                    break;

                case "P": /* Difference to Greenwich time (GMT) with colon between hours and minutes */
                    throw '"P" not implemented!';

                case "T": /* Timezone abbreviation */
                    throw '"T" not implemented!';

                case "Z": /* Timezone offset in seconds. The offset for timezones west of UTC is always negative, and for those east of UTC is always positive. */
                    result[i] = jsDate.getTimezoneOffset() * 60;
                    break;


                /* FULL DATE/TIME  */

                case "c": /* ISO 8601 date */
                    throw '"c" not implemented!';

                case "r": /* RFC 2822 formatted date  */
                    var jsDayName = this._wDays(jsDate.getDay()).substr(0, 3);
                    var jsMonthName = this._months(jsDate.getMonth()).substr(0, 3);
                    result[i] = jsDayName + ", " + jsDate.getDate() + " " + jsMonthName + this.get(" Y H:i:s O",jsDate);
                    break;

                case "U":  /* Seconds since the Unix Epoch (January 1 1970 00:00:00 GMT)  */
                    result[i] = Math.floor(jsDate.getTime() / 1000);
                    break;

                default:
                    result[i] = iFormat[i];
            }
        }

        return result.join('');

        },

        /**
         * Creates a date object based on a format string.
         * This works exactly as php date() function. http://php.net/manual/en/function.date.php
         *
         * @method set
         * @param   {String}    [format]    The format in which the date will be formatted. Defaults to 'Y-m-d'
         * @param   {String}    str_date    The date formatted.
         * @return  {Date}                  Date object based on the formatted date and format
         * @public
         * @static
         * @sample Ink_Util_Date_set.html 
         */
        set : function( format , str_date ) {
            if ( typeof str_date === 'undefined' ) { return ; }
            if ( typeof format === 'undefined' || format === '' ) { format = "Y-m-d"; }

            var iFormat = format.split("");
            var result = new Array( iFormat.length );
            var escapeChar = "\\";
            var mList;

            var objIndex = {
                year  : undefined ,
                month : undefined ,
                day   : undefined ,
                dayY  : undefined ,
                dayW  : undefined ,
                week  : undefined ,
                hour  : undefined ,
                hourD : undefined ,
                min   : undefined ,
                sec   : undefined ,
                msec  : undefined ,
                ampm  : undefined ,
                diffM : undefined ,
                diffH : undefined ,
                date  : undefined
            };

            var matches = 0;

            /* This switch is presented in the same order as in php date function (PHP 5.2.2) */
            for ( var i = 0; i < iFormat.length; i++) {
                switch( iFormat[ i ] ) {
                    case escapeChar:
                        result[i]      = iFormat[ i + 1 ];
                        i++;
                        break;

                    /* DAY */
                    case "d":   /* Day of the month, 2 digits with leading zeros; ex: 01 to 31  */
                        result[ i ]    = '(\\d{2})';
                        objIndex.day   = { original : i , match : matches++ };
                        break;

                    case "j":  /* Day of the month without leading zeros; ex: 1 to 31  */
                        result[ i ]    = '(\\d{1,2})';
                        objIndex.day   = { original : i , match : matches++ };
                        break;

                    case "D":   /* A textual representation of a day, three letters; Seg to Dom */
                        result[ i ]    = '([\\wá]{3})';
                        objIndex.dayW  = { original : i , match : matches++ };
                        break;

                    case "l":   /* A full textual representation of the day of the week; Domingo to Sabado  */
                        result[i]      = '([\\wá]{5,7})';
                        objIndex.dayW  = { original : i , match : matches++ };
                        break;

                    case "N":  /* ISO-8601 numeric representation of the day of the week; 1 (Segunda) to 7 (Domingo)  */
                        result[ i ]    = '(\\d)';
                        objIndex.dayW  = { original : i , match : matches++ };
                        break;

                    case "w":    /* Numeric representation of the day of the week; 0 (for Sunday) through 6 (for Saturday) */
                        result[ i ]    = '(\\d)';
                        objIndex.dayW  = { original : i , match : matches++ };
                        break;

                    case "S":  /* English ordinal suffix for the day of the month, 2 characters; st, nd, rd or th. Works well with j */
                        result[ i ]    = '\\w{2}';
                        break;

                    case "z":    /* The day of the year (starting from 0); 0 to 365 */
                        result[ i ]    = '(\\d{1,3})';
                        objIndex.dayY  = { original : i , match : matches++ };
                        break;

                    /* WEEK */
                    case "W":    /* ISO-8601 week number of year, weeks starting on Monday; ex: 42 (the 42nd week in the year)  */
                        result[ i ]    = '(\\d{1,2})';
                        objIndex.week  = { original : i , match : matches++ };
                        break;

                    /* MONTH */
                    case "F":   /* A full textual representation of a month, such as Janeiro or Marco; Janeiro a Dezembro */
                        result[ i ]    = '([\\wç]{4,9})';
                        objIndex.month = { original : i , match : matches++ };
                        break;

                    case "M":   /* A short textual representation of a month, three letters; Jan a Dez */
                        result[ i ]    = '(\\w{3})';
                        objIndex.month = { original : i , match : matches++ };
                        break;

                    case "m":   /* Numeric representation of a month, with leading zeros; 01 to 12  */
                        result[ i ]    = '(\\d{2})';
                        objIndex.month = { original : i , match : matches++ };
                        break;

                    case "n":   /* Numeric representation of a month, without leading zeros; 1 a 12  */
                        result[ i ]    = '(\\d{1,2})';
                        objIndex.month = { original : i , match : matches++ };
                        break;

                    case "t":   /* Number of days in the given month; ex: 28 */
                        result[ i ]    = '\\d{2}';
                        break;

                    /* YEAR */
                    case "L":   /* Whether it's a leap year; 1 if it is a leap year, 0 otherwise.  */
                        result[ i ]    = '\\w{4,5}';
                        break;

                    case "o":  /* ISO-8601 year number. This has the same value as Y, except that if the ISO week number (W) belongs to the previous or next year, that year is used instead.  */
                        throw '"o" not implemented!';

                    case "Y":  /* A full numeric representation of a year, 4 digits; 1999  */
                        result[ i ]    = '(\\d{4})';
                        objIndex.year  = { original : i , match : matches++ };
                        break;

                    case "y":  /* A two digit representation of a year; 99  */
                        result[ i ]    = '(\\d{2})';
                        if ( typeof objIndex.year === 'undefined' || iFormat[ objIndex.year.original ] !== 'Y' ) {
                            objIndex.year = { original : i , match : matches++ };
                        }
                        break;

                    /* TIME */
                    case "a":   /* Lowercase Ante meridiem and Post meridiem; am or pm */
                        result[ i ]    = '(am|pm)';
                        objIndex.ampm  = { original : i , match : matches++ };
                        break;

                    case "A":   /* Uppercase Ante meridiem and Post meridiem; AM or PM  */
                        result[ i ]    = '(AM|PM)';
                        objIndex.ampm  = { original : i , match : matches++ };
                        break;

                    case "B":  /* Swatch Internet time; 000 through 999  */
                        throw '"B" not implemented!';

                    case "g":   /* 12-hour format of an hour without leading zeros;  1 to 12 */
                        result[ i ]    = '(\\d{1,2})';
                        objIndex.hourD = { original : i , match : matches++ };
                        break;

                    case "G":   /* 24-hour format of an hour without leading zeros; 1 to 23 */
                        result[ i ]    = '(\\d{1,2})';
                        objIndex.hour  = { original : i , match : matches++ };
                        break;

                    case "h":   /* 12-hour format of an hour with leading zeros; 01 to 12 */
                        result[ i ]    = '(\\d{2})';
                        objIndex.hourD = { original : i , match : matches++ };
                        break;

                    case "H":   /* 24-hour format of an hour with leading zeros; 01 to 24 */
                        result[ i ]    = '(\\d{2})';
                        objIndex.hour  = { original : i , match : matches++ };
                        break;

                    case "i":   /* Minutes with leading zeros; 00 to 59 */
                        result[ i ]    = '(\\d{2})';
                        objIndex.min   = { original : i , match : matches++ };
                        break;

                    case "s":   /* Seconds with leading zeros; 00 to 59; */
                        result[ i ]    = '(\\d{2})';
                        objIndex.sec   = { original : i , match : matches++ };
                        break;

                    case "u":  /* Microseconds */
                        throw '"u" not implemented!';

                    /* TIMEZONE */
                    case "e": /* Timezone identifier  */
                        throw '"e" not implemented!';

                    case "I":   /*  "1" if Daylight Savings Time, "0" otherwise. Works only on the northern hemisphere */
                        result[i]      = '\\d';
                        break;

                    case "O":  /* Difference to Greenwich time (GMT) in hours */
                        result[ i ]    = '([-+]\\d{4})';
                        objIndex.diffH = { original : i , match : matches++ };
                        break;

                    case "P": /* Difference to Greenwich time (GMT) with colon between hours and minutes */
                        throw '"P" not implemented!';

                    case "T": /* Timezone abbreviation */
                        throw '"T" not implemented!';

                    case "Z": /* Timezone offset in seconds. The offset for timezones west of UTC is always negative, and for those east of UTC is always positive. */
                        result[ i ]    = '(\\-?\\d{1,5})';
                        objIndex.diffM = { original : i , match : matches++ };
                        break;

                    /* FULL DATE/TIME  */
                    case "c": /* ISO 8601 date */
                        throw '"c" not implemented!';

                    case "r": /* RFC 2822 formatted date  */
                        result[ i ]    = '([\\wá]{3}, \\d{1,2} \\w{3} \\d{4} \\d{2}:\\d{2}:\\d{2} [+\\-]\\d{4})';
                        objIndex.date  = { original : i , match : matches++ };
                        break;

                    case "U":  /* Seconds since the Unix Epoch (January 1 1970 00:00:00 GMT)  */
                        result[ i ]    = '(\\d{1,13})';
                        objIndex.date  = { original : i , match : matches++ };
                        break;

                    default:
                        result[ i ]    = iFormat[ i ];
                }
            }

            var pattr = new RegExp( result.join('') );

            try {
                mList = str_date.match( pattr );
                if ( !mList ) { return; }
            }
            catch ( e ) { return ; }

            var _haveDatetime = typeof objIndex.date  !== 'undefined';

            var _haveYear     = typeof objIndex.year  !== 'undefined';

            var _haveYDay     = typeof objIndex.dayY  !== 'undefined';

            var _haveDay      = typeof objIndex.day   !== 'undefined';
            var _haveMonth    = typeof objIndex.month !== 'undefined';
            var _haveMonthDay =  _haveMonth && _haveDay;
            var _haveOnlyDay  = !_haveMonth && _haveDay;

            var _haveWDay     = typeof objIndex.dayW  !== 'undefined';
            var _haveWeek     = typeof objIndex.week  !== 'undefined';
            var _haveWeekWDay =  _haveWeek && _haveWDay;
            var _haveOnlyWDay = !_haveWeek && _haveWDay;

            var _validDate    = _haveYDay || _haveMonthDay || !_haveYear && _haveOnlyDay || _haveWeekWDay || !_haveYear && _haveOnlyWDay;
            var _noDate       = !_haveYear && !_haveYDay && !_haveDay && !_haveMonth && !_haveWDay && !_haveWeek;

            var _haveHour12   = typeof objIndex.hourD !== 'undefined' && typeof objIndex.ampm !== 'undefined';
            var _haveHour24   = typeof objIndex.hour  !== 'undefined';
            var _haveHour     = _haveHour12 || _haveHour24;

            var _haveMin      = typeof objIndex.min   !== 'undefined';
            var _haveSec      = typeof objIndex.sec   !== 'undefined';
            var _haveMSec     = typeof objIndex.msec  !== 'undefined';

            var _haveMoreM    = !_noDate || _haveHour;
            var _haveMoreS    = _haveMoreM || _haveMin;

            var _haveDiffM    = typeof objIndex.diffM !== 'undefined';
            var _haveDiffH    = typeof objIndex.diffH !== 'undefined';
            //var _haveGMT      = _haveDiffM || _haveDiffH;
            var hour;
            var min;

            if ( _haveDatetime ) {
                if ( iFormat[ objIndex.date.original ] === 'U' ) {
                    return new Date( +mList[ objIndex.date.match + 1 ] * 1000 );
                }

                var dList = mList[ objIndex.date.match + 1 ].match( /\w{3}, (\d{1,2}) (\w{3}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+\-]\d{4})/ );
                hour  = +dList[ 4 ] + ( +dList[ 7 ].slice( 0 , 3 ) );
                min   = +dList[ 5 ] + ( dList[ 7 ].slice( 0 , 1 ) + dList[ 7 ].slice( 3 ) ) / 100 * 60;

                return new Date( dList[ 3 ] , this._iMonth( dList[ 2 ] ) , dList[ 1 ] , hour  , min , dList[ 6 ] );
            }

            var _d = new Date( );
            var year;
            var month;
            var day;
            var sec;
            var msec;
            var gmt;

            if ( !_validDate && !_noDate ) { return ; }

            if ( _validDate ) {
                if ( _haveYear ) {
                    var _y = _d.getFullYear( ) - 50 + '';
                    year   = mList[ objIndex.year.match + 1 ];
                    if ( iFormat[ objIndex.year.original ] === 'y' ) {
                        year = +_y.slice( 0 , 2 ) + ( year >= ( _y ).slice( 2 ) ? 0 : 1 ) + year;
                    }
                } else {
                    year = _d.getFullYear();
                }

                if ( _haveYDay ) {
                    month = 0;
                    day   = mList[ objIndex.dayY.match + 1 ];
                } else if ( _haveDay ) {
                    if ( _haveMonth ) {
                        month = this._iMonth( mList[ objIndex.month.match + 1 ] );
                    } else {
                        month = _d.getMonth( );
                    }

                    day = mList[ objIndex.day.match + 1 ];
                } else {
                    month = 0;

                    var week;
                    if ( _haveWeek ) {
                        week = mList[ objIndex.week.match + 1 ];
                    } else {
                        week = this.get( 'W' , _d );
                    }

                    day = ( week - 2 ) * 7 + ( 8 - ( ( new Date( year , 0 , 1 ) ).getDay( ) || 7 ) ) + this._iWeek( mList[ objIndex.week.match + 1 ] );
                }

                if ( month === 0 && day > 31 ) {
                    var aux = new Date( year , month , day );
                    month   = aux.getMonth( );
                    day     = aux.getDate( );
                }
            }
            else {
                year  = _d.getFullYear( );
                month = _d.getMonth( );
                day   = _d.getDate( );
            }

            if      ( _haveHour12 ) { hour = +mList[ objIndex.hourD.match + 1 ] + ( mList[ objIndex.ampm.match + 1 ] === 'pm' ? 12 : 0 ); }
            else if ( _haveHour24 ) { hour = mList[ objIndex.hour.match + 1 ]; }
            else if ( _noDate     ) { hour = _d.getHours( ); }
            else                    { hour = '00'; }

            if      (  _haveMin   ) { min  = mList[ objIndex.min.match + 1 ]; }
            else if ( !_haveMoreM ) { min  = _d.getMinutes( ); }
            else                    { min  = '00'; }

            if      (  _haveSec   ) { sec  = mList[ objIndex.sec.match + 1 ]; }
            else if ( !_haveMoreS ) { sec  = _d.getSeconds( ); }
            else                    { sec  = '00'; }

            if      ( _haveMSec )   { msec = mList[ objIndex.msec.match + 1 ]; }
            else                    { msec = '000'; }

            if      ( _haveDiffH )  { gmt  = mList[ objIndex.diffH.match + 1 ]; }
            else if ( _haveDiffM )  { gmt  = String( -1 * mList[ objIndex.diffM.match + 1 ] / 60 * 100 ).replace( /^(\d)/ , '+$1' ).replace( /(^[\-+])(\d{3}$)/ , '$10$2' ); }
            else                    { gmt  = '+0000'; }

            return new Date( year, month, day, hour, min, sec );
        }
    };


    return InkDate;

});

/**
 * Dump/Profiling Utilities
 * @module Ink.Util.Dumper_1
 * @version 1
 */

Ink.createModule('Ink.Util.Dumper', '1', [], function() {

    'use strict';

    /**
     * @namespace Ink.Util.Dumper_1 
     */

    var Dumper = {

        /**
         * Hex code for the 'tab'
         * 
         * @property _tab
         * @type {String}
         * @private
         * @readOnly
         * @static
         *
         */
        _tab: '\xA0\xA0\xA0\xA0',

        /**
         * Function that returns the argument passed formatted
         *
         * @method _formatParam
         * @param {Mixed} param
         * @return {String} The argument passed formatted
         * @private
         * @static
         */
        _formatParam: function(param)
        {
            var formated = '';

            switch(typeof(param)) {
                case 'string':
                    formated = '(string) '+param;
                    break;
                case 'number':
                    formated = '(number) '+param;
                    break;
                case 'boolean':
                    formated = '(boolean) '+param;
                    break;
                case 'object':
                    if(param !== null) {
                        if(param.constructor === Array) {
                            formated = 'Array \n{\n' + this._outputFormat(param, 0) + '\n}';
                        } else {
                            formated = 'Object \n{\n' + this._outputFormat(param, 0) + '\n}';
                        }
                    } else {
                        formated = 'null';
                    }
                    break;
                default:
                    formated = false;
            }

            return formated;
        },

        /**
         * Function that returns the tabs concatenated
         *
         * @method _getTabs
         * @param {Number} numberOfTabs Number of Tabs
         * @return {String} Tabs concatenated
         * @private
         * @static
         */
        _getTabs: function(numberOfTabs)
        {
            var tabs = '';
            for(var _i = 0; _i < numberOfTabs; _i++) {
                tabs += this._tab;
            }
            return tabs;
        },

        /**
         * Function that formats the parameter to display.
         *
         * @method _outputFormat
         * @param {Any} param
         * @param {Number} dim
         * @return {String} The parameter passed formatted to displat
         * @private
         * @static
         */
        _outputFormat: function(param, dim)
        {
            var formated = '';
            //var _strVal = false;
            var _typeof = false;
            for(var key in param) {
                if(param[key] !== null) {
                    if(typeof(param[key]) === 'object' && (param[key].constructor === Array || param[key].constructor === Object)) {
                        if(param[key].constructor === Array) {
                            _typeof = 'Array';
                        } else if(param[key].constructor === Object) {
                            _typeof = 'Object';
                        }
                        formated += this._tab + this._getTabs(dim) + '[' + key + '] => <b>'+_typeof+'</b>\n';
                        formated += this._tab + this._getTabs(dim) + '{\n';
                        formated += this._outputFormat(param[key], dim + 1) + this._tab + this._getTabs(dim) + '}\n';
                    } else if(param[key].constructor === Function) {
                        continue;
                    } else {
                        formated = formated + this._tab + this._getTabs(dim) + '[' + key + '] => ' + param[key] + '\n';
                    }
                } else {
                    formated = formated + this._tab + this._getTabs(dim) + '[' + key + '] => null \n';
                }
            }
            return formated;
        },

        /**
         * Prints variable structure.
         *
         * @method printDump
         * @param {Any}                 param       Variable to be dumped.
         * @param {DOMElement|String}   [target]    Element to print the dump on.
         * @public
         * @static
         * @sample Ink_Util_Dumper_printDump.html 
         */
        printDump: function(param, target)
        {
            /*jshint evil:true */
            if(!target || typeof(target) === 'undefined') {
                document.write('<pre>'+this._formatParam(param)+'</pre>');
            } else {
                if(typeof(target) === 'string') {
                    document.getElementById(target).innerHTML = '<pre>' + this._formatParam(param) + '</pre>';
                } else if(typeof(target) === 'object') {
                    target.innerHTML = '<pre>'+this._formatParam(param)+'</pre>';
                } else {
                    throw "TARGET must be an element or an element ID";
                }
            }
        },

        /**
         * Get a variable's structure.
         *
         * @method returnDump
         * @param   {Any}       param   Variable to get the structure.
         * @return  {String}            The variable's structure.
         * @public
         * @static
         * @sample Ink_Util_Dumper_returnDump.html 
         */
        returnDump: function(param)
        {
            return this._formatParam(param);
        },

        /**
         * Alert a variable's structure.
         *
         * @method alertDump
         * @param {Any}     param     Variable to be dumped.
         * @public
         * @static
         * @sample Ink_Util_Dumper_alertDump.html 
         */
        alertDump: function(param)
        {
            window.alert(this._formatParam(param).replace(/(<b>)(Array|Object)(<\/b>)/g, "$2"));
        },

        /**
         * Prints the variable structure to a new window.
         *
         * @method windowDump
         * @param {Any}     param   Variable to be dumped.
         * @public
         * @static
         * @sample Ink_Util_Dumper_windowDump.html 
         */
        windowDump: function(param)
        {
            var dumperwindow = 'dumperwindow_'+(Math.random() * 10000);
            var win = window.open('',
                dumperwindow,
                'width=400,height=300,left=50,top=50,status,menubar,scrollbars,resizable'
            );
            win.document.open();
            win.document.write('<pre>'+this._formatParam(param)+'</pre>');
            win.document.close();
            win.focus();
        }

    };

    return Dumper;

});

/**
 * Internationalization Utilities 
 * @module Ink.Util.I18n_1
 * @version 1
 */

Ink.createModule('Ink.Util.I18n', '1', [], function () {
    'use strict';

    var pattrText = /\{(?:(\{.*?})|(?:%s:)?(\d+)|(?:%s)?|([\w-]+))}/g;

    var funcOrVal = function( ret , args ) {
        if ( typeof ret === 'function' ) {
            return ret.apply(this, args);
        } else if (typeof ret !== undefined) {
            return ret;
        } else {
            return '';
        }
    };

    /**
     * You can use this module to internationalize your applications. It roughly emulates GNU gettext's API.
     *
     * @class Ink.Util.I18n
     * @constructor
     *
     * @param {Object} dict         Object mapping language codes (in the form of `pt_PT`, `pt_BR`, `fr`, `en_US`, etc.) to their `dictionaries`
     * @param {String} [lang='pt_PT'] language code of the target language
     *
     * @sample Ink_Util_I18n_1.html
     */
    var I18n = function( dict , lang , testMode ) {
        if ( !( this instanceof I18n ) ) { return new I18n( dict , lang , testMode ); }

        this.reset( )
            .lang( lang )
            .testMode( testMode )
            .append( dict || { } , lang );
    };

    I18n.prototype = {
        reset: function( ) {
            this._dicts    = [ ];
            this._dict     = { };
            this._testMode = false;
            this._lang     = this._gLang;

            return this;
        },
        /**
         * Adds translation strings for the helper to use.
         *
         * @method append
         * @param   {Object} dict Object containing language objects identified by their language code
         *
         * @sample Ink_Util_I18n_1_append.html
         */
        append: function( dict ) {
            this._dicts.push( dict );

            this._dict = Ink.extendObj(this._dict , dict[ this._lang ] );

            return this;
        },
        /**
         * Gets or sets the language.
         * If there are more dictionaries available in cache, they will be loaded.
         *
         * @method  lang
         * @param   {String}    lang    Language code to set this instance to.
         */
        lang: function( lang ) {
            if ( !arguments.length ) { return this._lang; }

            if ( lang && this._lang !== lang ) {
                this._lang = lang;

                this._dict = { };

                for ( var i = 0, l = this._dicts.length; i < l; i++ ) {
                    this._dict = Ink.extendObj( this._dict , this._dicts[ i ][ lang ] || { } );
                }
            }

            return this;
        },
        /**
         * Sets or unsets test mode.
         * In test mode, unknown strings are wrapped in `[ ... ]`. This is useful for debugging your application and to make sure all your translation keys are in place.
         *
         * @method  testMode
         * @param   {Boolean} bool Flag to set the test mode state
         */
        testMode: function( bool ) {
            if ( !arguments.length ) { return !!this._testMode; }

            if ( bool !== undefined  ) { this._testMode = !!bool; }

            return this;
        },

        /**
         * Gest a key from the current dictionary
         *
         * @method getKey
         * @param {String} key
         * @return {Mixed} The object which happened to be in the current language dictionary on the given key.
         *
         * @sample Ink_Util_I18n_1_getKey.html
         */
        getKey: function( key ) {
            var ret;
            var gLang = this._gLang;
            var lang  = this._lang;
    
            if ( key in this._dict ) {
                ret = this._dict[ key ];
            } else {
                I18n.lang( lang );
    
                ret = this._gDict[ key ];
    
                I18n.lang( gLang );
            }
    
            return ret;
        },

        /**
         * Translates a string.
         * Given a translation key, return a translated string, with replaced parameters.
         * When a translated string is not available, the original string is returned unchanged.
         *
         * @method text
         * @param {String} str          Key to look for in i18n dictionary (which is returned verbatim if unknown)
         * @param {Object} [namedParms] Named replacements. Replaces {named} with values in this object.
         * @param {String} [args]      Replacement #1 (replaces first {} and all {1})
         * @param {String} [arg2]       Replacement #2 (replaces second {} and all {2})
         * @param {String} [argn*]      Replacement #n (replaces nth {} and all {n})
         *
         * @sample Ink_Util_I18n_1_text.html
         */
        text: function( str /*, replacements...*/ ) {
            if ( typeof str !== 'string' ) { return; } // Backwards-compat

            var pars = Array.prototype.slice.call( arguments , 1 );
            var idx = 0;
            var isObj = typeof pars[ 0 ] === 'object';

            var original = this.getKey( str );
            if ( original === undefined ) { original = this._testMode ? '[' + str + ']' : str; }
            if ( typeof original === 'number' ) { original += ''; }

            if (typeof original === 'string') {
                original = original.replace( pattrText , function( m , $1 , $2 , $3 ) {
                    var ret =
                        $1 ? $1 :
                        $2 ? pars[ $2 - ( isObj ? 0 : 1 ) ] :
                        $3 ? pars[ 0 ][ $3 ] || '' :
                             pars[ (idx++) + ( isObj ? 1 : 0 ) ];
                    return funcOrVal( ret , [idx].concat(pars) );
                });
                return original;
            }
             
            return (
                typeof original === 'function' ? original.apply( this , pars ) :
                original instanceof Array      ? funcOrVal( original[ pars[ 0 ] ] , pars ) :
                typeof original === 'object'   ? funcOrVal( original[ pars[ 0 ] ] , pars ) :
                                                 '');
        },

        /**
         * Translates and pluralizes text.
         * Given a singular string, a plural string and a number, translates either the singular or plural string.
         *
         * @method ntext
         * @return {String}
         *
         * @param {String} strSin   Word to use when count is 1
         * @param {String} strPlur  Word to use otherwise
         * @param {Number} count    Number which defines which word to use
         * @param [args*]           Extra arguments, to be passed to `text()`
         *
         * @sample Ink_Util_I18n_1_ntext.html
         */
        ntext: function( strSin , strPlur , count ) {
            var pars = Array.prototype.slice.apply( arguments );
            var original;

            if ( pars.length === 2 && typeof strPlur === 'number' ) {
                original = this.getKey( strSin );
                if ( !( original instanceof Array ) ) { return ''; }

                pars.splice( 0 , 1 );
                original = original[ strPlur === 1 ? 0 : 1 ];
            } else {
                pars.splice( 0 , 2 );
                original = count === 1 ? strSin : strPlur;
            }

            return this.text.apply( this , [ original ].concat( pars ) );
        },

        /**
         * Gets the ordinal suffix of a number.
         *
         * This works by using transforms (in the form of Objects or Functions) passed into the function or found in the special key `_ordinals` in the active language dictionary.
         *
         * @method ordinal
         *
         * @param {Number}          num                         Input number
         * @param {Object|Function} [options]={}                Dictionaries for translating. Each of these options' fallback is found in the current language's dictionary. The lookup order is the following: `exceptions`, `byLastDigit`, `default`. Each of these may be either an `Object` or a `Function`. If it's a function, it is called (with `number` and `digit` for any function except for byLastDigit, which is called with the `lastDigit` of the number in question), and if the function returns a string, that is used. If it's an object, the property is looked up using `obj[prop]`. If what is found is a string, it is used directly.
         * @param {Object|Function} [options.byLastDigit]={}    If the language requires the last digit to be considered, mappings of last digits to ordinal suffixes can be created here.
         * @param {Object|Function} [options.exceptions]={}     Map unique, special cases to their ordinal suffixes.
         *
         * @returns {String}        Ordinal suffix for `num`.
         *
         * @sample Ink_Util_I18n_1_ordinal.html
         **/
        ordinal: function( num ) {
            if ( num === undefined ) { return ''; }

            var lastDig = +num.toString( ).slice( -1 );

            var ordDict  = this.getKey( '_ordinals' );
            if ( ordDict === undefined ) { return ''; }

            if ( typeof ordDict === 'string' ) { return ordDict; }

            var ret;

            if ( typeof ordDict === 'function' ) {
                ret = ordDict( num , lastDig );

                if ( typeof ret === 'string' ) { return ret; }
            }

            if ( 'exceptions' in ordDict ) {
                ret = typeof ordDict.exceptions === 'function' ? ordDict.exceptions( num , lastDig ) :
                      num in ordDict.exceptions                ? funcOrVal( ordDict.exceptions[ num ] , [num , lastDig] ) :
                                                                 undefined;

                if ( typeof ret === 'string' ) { return ret; }
            }

            if ( 'byLastDigit' in ordDict ) {
                ret = typeof ordDict.byLastDigit === 'function' ? ordDict.byLastDigit( lastDig , num ) :
                      lastDig in ordDict.byLastDigit            ? funcOrVal( ordDict.byLastDigit[ lastDig ] , [lastDig , num] ) :
                                                                  undefined;

                if ( typeof ret === 'string' ) { return ret; }
            }

            if ( 'default' in ordDict ) {
                ret = funcOrVal( ordDict['default'] , [ num , lastDig ] );

                if ( typeof ret === 'string' ) { return ret; }
            }

            return '';
        },

        /**
         * Create an alias.
         *
         * Returns an alias to this I18n instance. It contains the I18n methods documented here, but is also a function. If you call it, it just calls `text()`. This is commonly assigned to "_".
         *
         * @method alias
         * @returns {Function} an alias to `text()` on this instance. You can also access the rest of the translation API through this alias.
         *
         * @sample Ink_Util_I18n_1_alias.html
         */
        alias: function( ) {
            var ret      = Ink.bind( I18n.prototype.text     , this );
            ret.ntext    = Ink.bind( I18n.prototype.ntext    , this );
            ret.append   = Ink.bind( I18n.prototype.append   , this );
            ret.ordinal  = Ink.bind( I18n.prototype.ordinal  , this );
            ret.testMode = Ink.bind( I18n.prototype.testMode , this );

            return ret;
        }
    };

    /**
     * Resets I18n global state (global dictionaries, and default language for instances)
     *
     * @method reset
     * @static
     *
     **/
    I18n.reset = function( ) {
        I18n.prototype._gDicts = [ ];
        I18n.prototype._gDict  = { };
        I18n.prototype._gLang  = 'pt_PT';
    };
    I18n.reset( );

    /**
     * Adds a dictionary to be used in all I18n instances for the corresponding language.
     *
     * @method appendGlobal
     * @static
     *
     * @param dict {Object}     Dictionary to be added
     * @param lang {String}     Language fo the dictionary being added
     *
     */
    I18n.appendGlobal = function( dict , lang ) {
        if ( lang ) {
            if ( !( lang in dict ) ) {
                var obj = { };

                obj[ lang ] = dict;

                dict = obj;
            }

            if ( lang !== I18n.prototype._gLang ) { I18n.lang( lang ); }
        }

        I18n.prototype._gDicts.push( dict );

        Ink.extendObj( I18n.prototype._gDict , dict[ I18n.prototype._gLang ] );
    };

    I18n.append = function () {
        // [3.1.0] remove this alias
        Ink.warn('Ink.Util.I18n.append() was renamed to appendGlobal().');
        return I18n.appendGlobal.apply(I18n, [].slice.call(arguments));
    };

    /**
     * Gets or sets the current default language of I18n instances.
     *
     * @method langGlobal
     * @param lang the new language for all I18n instances
     *
     * @static
     *
     * @return {String} language code
     */
    I18n.langGlobal = function( lang ) {
        if ( !arguments.length ) { return I18n.prototype._gLang; }

        if ( lang && I18n.prototype._gLang !== lang ) {
            I18n.prototype._gLang = lang;

            I18n.prototype._gDict = { };

            for ( var i = 0, l = I18n.prototype._gDicts.length; i < l; i++ ) {
                Ink.extendObj( I18n.prototype._gDict , I18n.prototype._gDicts[ i ][ lang ] || { } );
            }
        }
    };

    I18n.lang = function () {
        // [3.1.0] remove this alias
        Ink.warn('Ink.Util.I18n.lang() was renamed to langGlobal().');
        return I18n.langGlobal.apply(I18n, [].slice.call(arguments));
    };
    
    return I18n;
});
/**
 * JSON Utilities
 * @module Ink.Util.Json_1
 * @version 1
 */

Ink.createModule('Ink.Util.Json', '1', [], function() {
    'use strict';

    var function_call = Function.prototype.call;
    var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

    function twoDigits(n) {
        var r = '' + n;
        if (r.length === 1) {
            return '0' + r;
        } else {
            return r;
        }
    }

    var dateToISOString = Date.prototype.toISOString ?
        Ink.bind(function_call, Date.prototype.toISOString) :
        function(date) {
            // Adapted from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
            return date.getUTCFullYear() +
                '-' + twoDigits( date.getUTCMonth() + 1 ) +
                '-' + twoDigits( date.getUTCDate() ) +
                'T' + twoDigits( date.getUTCHours() ) +
                ':' + twoDigits( date.getUTCMinutes() ) +
                ':' + twoDigits( date.getUTCSeconds() ) +
                '.' + String( (date.getUTCMilliseconds()/1000).toFixed(3) ).slice( 2, 5 ) +
                'Z';
        };

    /**
     * Use this class to convert JSON strings to JavaScript objects
     * `.parse()` and also to do the opposite operation `.stringify()`.
     * Internally, the standard JSON implementation is used if available
     * Otherwise, the functions mimic the standard implementation.
     *
     * Here's how to produce JSON from an existing object:
     * 
     *      Ink.requireModules(['Ink.Util.Json_1'], function (Json) {
     *          var obj = {
     *              key1: 'value1',
     *              key2: 'value2',
     *              keyArray: ['arrayValue1', 'arrayValue2', 'arrayValue3']
     *          };
     *          Json.stringify(obj);  // The above object as a JSON string
     *      });
     *
     * And here is how to parse JSON:
     *
     *      Ink.requireModules(['Ink.Util.Json_1'], function (Json) {
     *          var source = '{"key": "value", "array": [true, null, false]}';
     *          Json.parse(source);  // The above JSON string as an object
     *      });
     *
     * @namespace Ink.Util.Json_1 
     * @static
     * 
     */
    var InkJson = {
        _nativeJSON: window.JSON || null,

        _convertToUnicode: false,

        // Escape characters so as to embed them in JSON strings
        _escape: function (theString) {
            var _m = { '\b': '\\b', '\t': '\\t', '\n': '\\n', '\f': '\\f', '\r': '\\r', '"': '\\"',  '\\': '\\\\' };

            if (/["\\\x00-\x1f]/.test(theString)) {
                theString = theString.replace(/([\x00-\x1f\\"])/g, function(a, b) {
                    var c = _m[b];
                    if (c) {
                        return c;
                    }
                    c = b.charCodeAt();
                    return '\\u00' + Math.floor(c / 16).toString(16) + (c % 16).toString(16);
                });
            }

            return theString;
        },

        // A character conversion map
        _toUnicode: function (theString)
        {
            if(!this._convertToUnicode) {
                return this._escape(theString);
            } else {
                var unicodeString = '';
                var inInt = false;
                var theUnicode = false;
                var i = 0;
                var total = theString.length;
                while(i < total) {
                    inInt = theString.charCodeAt(i);
                    if( (inInt >= 32 && inInt <= 126) ||
                            //(inInt >= 48 && inInt <= 57) ||
                            //(inInt >= 65 && inInt <= 90) ||
                            //(inInt >= 97 && inInt <= 122) ||
                            inInt === 8 ||
                            inInt === 9 ||
                            inInt === 10 ||
                            inInt === 12 ||
                            inInt === 13 ||
                            inInt === 32 ||
                            inInt === 34 ||
                            inInt === 47 ||
                            inInt === 58 ||
                            inInt === 92) {

                        if(inInt === 34 || inInt === 92 || inInt === 47) {
                            theUnicode = '\\'+theString.charAt(i);
                        } else if(inInt === 8) {
                            theUnicode = '\\b';
                        } else if(inInt === 9) {
                            theUnicode = '\\t';
                        } else if(inInt === 10) {
                            theUnicode = '\\n';
                        } else if(inInt === 12) {
                            theUnicode = '\\f';
                        } else if(inInt === 13) {
                            theUnicode = '\\r';
                        } else {
                            theUnicode = theString.charAt(i);
                        }
                    } else {
                        if(this._convertToUnicode) {
                            theUnicode = theString.charCodeAt(i).toString(16)+''.toUpperCase();
                            while (theUnicode.length < 4) {
                                theUnicode = '0' + theUnicode;
                            }
                            theUnicode = '\\u' + theUnicode;
                        } else {
                            theUnicode = theString.charAt(i);
                        }
                    }
                    unicodeString += theUnicode;

                    i++;
                }

                return unicodeString;
            }

        },

        _stringifyValue: function(param) {
            if (typeof param === 'string') {
                return '"' + this._toUnicode(param) + '"';
            } else if (typeof param === 'number' && (isNaN(param) || !isFinite(param))) {  // Unusable numbers go null
                return 'null';
            } else if (typeof param === 'undefined' || param === null) {  // And so does undefined
                return 'null';
            } else if (typeof param.toJSON === 'function') {
                var t = param.toJSON();
                if (typeof t === 'string') {
                    return '"' + this._escape(t) + '"';
                } else {
                    return this._escape(t.toString());
                }
            } else if (typeof param === 'number' || typeof param === 'boolean') {  // These ones' toString methods return valid JSON.
                return '' + param;
            } else if (typeof param === 'function') {
                return 'null';  // match JSON.stringify
            } else if (param.constructor === Date) {
                return '"' + this._escape(dateToISOString(param)) + '"';
            } else if (param.constructor === Array) {
                var arrayString = '';
                for (var i = 0, len = param.length; i < len; i++) {
                    if (i > 0) {
                        arrayString += ',';
                    }
                    arrayString += this._stringifyValue(param[i]);
                }
                return '[' + arrayString + ']';
            } else {  // Object
                var objectString = '';
                for (var k in param)  {
                    if ({}.hasOwnProperty.call(param, k)) {
                        if (objectString !== '') {
                            objectString += ',';
                        }
                        objectString += '"' + this._escape(k) + '": ' + this._stringifyValue(param[k]);
                    }
                }
                return '{' + objectString + '}';
            }
        },

        /**
         * Serializes a JSON object into a string.
         *
         * @method stringify
         * @param   {Object}      input                 Data to be serialized into JSON
         * @param   {Boolean}     convertToUnicode      When `true`, converts string contents to unicode \uXXXX
         * @return  {String}                            Serialized string
         *
         * @sample Ink_Util_Json_stringify.html 
         */
        stringify: function(input, convertToUnicode) {
            this._convertToUnicode = !!convertToUnicode;
            if(!this._convertToUnicode && this._nativeJSON) {
                return this._nativeJSON.stringify(input);
            }
            return this._stringifyValue(input);  // And recurse.
        },
        
        /**
         * Parses a JSON text through a function
         * 
         * @method parse
         * @param text      {String}    Input string
         * @param reviver   {Function}  Function receiving `(key, value)`, and `this`=(containing object), used to walk objects.
         * 
         * @return {Object}             JSON object
         *
         * @sample Ink_Util_Json_parse.html 
         */
        /* From https://github.com/douglascrockford/JSON-js/blob/master/json.js */
        parse: function (text, reviver) {
            /*jshint evil:true*/

// The parse method takes a text and an optional reviver function, and returns
// a JavaScript value if the text is a valid JSON text.

            var j;

            function walk(holder, key) {

// The walk method is used to recursively walk the resulting structure so
// that modifications can be made.

                var k, v, value = holder[key];
                if (value && typeof value === 'object') {
                    for (k in value) {
                        if (Object.prototype.hasOwnProperty.call(value, k)) {
                            v = walk(value, k);
                            if (v !== undefined) {
                                value[k] = v;
                            } else {
                                delete value[k];
                            }
                        }
                    }
                }
                return reviver.call(holder, key, value);
            }


// Parsing happens in four stages. In the first stage, we replace certain
// Unicode characters with escape sequences. JavaScript handles many characters
// incorrectly, either silently deleting them, or treating them as line endings.

            text = String(text);
            cx.lastIndex = 0;
            if (cx.test(text)) {
                text = text.replace(cx, function (a) {
                    return '\\u' +
                        ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
                });
            }

// In the second stage, we run the text against regular expressions that look
// for non-JSON patterns. We are especially concerned with '()' and 'new'
// because they can cause invocation, and '=' because it can cause mutation.
// But just to be safe, we want to reject all unexpected forms.

// We split the second stage into 4 regexp operations in order to work around
// crippling inefficiencies in IE's and Safari's regexp engines. First we
// replace the JSON backslash pairs with '@' (a non-JSON character). Second, we
// replace all simple value tokens with ']' characters. Third, we delete all
// open brackets that follow a colon or comma or that begin the text. Finally,
// we look to see that the remaining characters are only whitespace or ']' or
// ',' or ':' or '{' or '}'. If that is so, then the text is safe for eval.

            if (/^[\],:{}\s]*$/
                    .test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
                        .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
                        .replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

// In the third stage we use the eval function to compile the text into a
// JavaScript structure. The '{' operator is subject to a syntactic ambiguity
// in JavaScript: it can begin a block or an object literal. We wrap the text
// in parens to eliminate the ambiguity.

                j = eval('(' + text + ')');

// In the optional fourth stage, we recursively walk the new structure, passing
// each name/value pair to a reviver function for possible transformation.

                return typeof reviver === 'function' ?
                    walk({'': j}, '') :
                    j;
            }

// If the text is not JSON parseable, then a SyntaxError is thrown.

            throw new SyntaxError('JSON.parse');
        }
    };

    return InkJson;
});

/**
 * String Utilities
 * @module Ink.Util.String_1
 * @version 1
 */

Ink.createModule('Ink.Util.String', '1', [], function() {

    'use strict';

    /**
     * @namespace Ink.Util.String_1 
     */
    var InkUtilString = {

        /**
         * List of special chars
         * 
         * @property _chars
         * @type {Array}
         * @private
         * @readOnly
         * @static
         */
        _chars: ['&','à','á','â','ã','ä','å','æ','ç','è','é',
                'ê','ë','ì','í','î','ï','ð','ñ','ò','ó','ô',
                'õ','ö','ø','ù','ú','û','ü','ý','þ','ÿ','À',
                'Á','Â','Ã','Ä','Å','Æ','Ç','È','É','Ê','Ë',
                'Ì','Í','Î','Ï','Ð','Ñ','Ò','Ó','Ô','Õ','Ö',
                'Ø','Ù','Ú','Û','Ü','Ý','Þ','€','\"','ß','<',
                '>','¢','£','¤','¥','¦','§','¨','©','ª','«',
                '¬','\xad','®','¯','°','±','²','³','´','µ','¶',
                '·','¸','¹','º','»','¼','½','¾'],

        /**
         * List of the special characters' html entities
         * 
         * @property _entities
         * @type {Array}
         * @private
         * @readOnly
         * @static
         */
        _entities: ['amp','agrave','aacute','acirc','atilde','auml','aring',
                    'aelig','ccedil','egrave','eacute','ecirc','euml','igrave',
                    'iacute','icirc','iuml','eth','ntilde','ograve','oacute',
                    'ocirc','otilde','ouml','oslash','ugrave','uacute','ucirc',
                    'uuml','yacute','thorn','yuml','Agrave','Aacute','Acirc',
                    'Atilde','Auml','Aring','AElig','Ccedil','Egrave','Eacute',
                    'Ecirc','Euml','Igrave','Iacute','Icirc','Iuml','ETH','Ntilde',
                    'Ograve','Oacute','Ocirc','Otilde','Ouml','Oslash','Ugrave',
                    'Uacute','Ucirc','Uuml','Yacute','THORN','euro','quot','szlig',
                    'lt','gt','cent','pound','curren','yen','brvbar','sect','uml',
                    'copy','ordf','laquo','not','shy','reg','macr','deg','plusmn',
                    'sup2','sup3','acute','micro','para','middot','cedil','sup1',
                    'ordm','raquo','frac14','frac12','frac34'],

        /**
         * List of accented chars
         * 
         * @property _accentedChars
         * @type {Array}
         * @private
         * @readOnly
         * @static
         */
        _accentedChars:['à','á','â','ã','ä','å',
                        'è','é','ê','ë',
                        'ì','í','î','ï',
                        'ò','ó','ô','õ','ö',
                        'ù','ú','û','ü',
                        'ç','ñ',
                        'À','Á','Â','Ã','Ä','Å',
                        'È','É','Ê','Ë',
                        'Ì','Í','Î','Ï',
                        'Ò','Ó','Ô','Õ','Ö',
                        'Ù','Ú','Û','Ü',
                        'Ç','Ñ'],

        /**
         * List of the accented chars (above), but without the accents
         * 
         * @property _accentedRemovedChars
         * @type {Array}
         * @private
         * @readOnly
         * @static
         */
        _accentedRemovedChars:['a','a','a','a','a','a',
                               'e','e','e','e',
                               'i','i','i','i',
                               'o','o','o','o','o',
                               'u','u','u','u',
                               'c','n',
                               'A','A','A','A','A','A',
                               'E','E','E','E',
                               'I','I','I','I',
                               'O','O','O','O','O',
                               'U','U','U','U',
                               'C','N'],
        /**
         * Object that contains the basic HTML unsafe chars, as keys, and their HTML entities as values
         * 
         * @property _htmlUnsafeChars
         * @type {Object}
         * @private
         * @readOnly
         * @static
         */
        _htmlUnsafeChars:{'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'},

        /**
         * Capitalizes a word.
         * If param as more than one word, it converts first letter of all words that have more than 2 letters
         *
         * @method ucFirst
         * @param   {String}  string                String to capitalize.
         * @param   {Boolean} [firstWordOnly]=false Flag to capitalize only the first word.
         * @return  {String}                        Camel cased string.
         * @public
         * @static
         * @sample Ink_Util_String_ucFirst.html 
         */
        ucFirst: function(string, firstWordOnly) {
            var replacer = firstWordOnly ? /(^|\s)(\w)(\S{2,})/ : /(^|\s)(\w)(\S{2,})/g;
            return string ? String(string).replace(replacer, function(_, $1, $2, $3){
                return $1 + $2.toUpperCase() + $3.toLowerCase();
            }) : string;
        },

        /**
         * Trims whitespace from strings
         *
         * @method trim
         * @param   {String} string     String to be trimmed
         * @return  {String}            Trimmed string
         * @public
         * @static
         * @sample Ink_Util_String_trim.html 
         */
        trim: function(string)
        {
            if (typeof string === 'string') {
                return string.replace(/^\s+|\s+$|\n+$/g, '');
            }
            return string;
        },

        /**
         * Strips HTML tags from strings
         *
         * @method stripTags
         * @param   {String} string     String to strip tags from.
         * @param   {String} allowed    Comma separated list of allowed tags.
         * @return  {String}            Stripped string
         * @public
         * @static
         * @sample Ink_Util_String_stripTags.html 
         */
        stripTags: function(string, allowed)
        {
            if (allowed && typeof allowed === 'string') {
                var aAllowed = InkUtilString.trim(allowed).split(',');
                var aNewAllowed = [];
                var cleanedTag = false;
                for(var i=0; i < aAllowed.length; i++) {
                    if(InkUtilString.trim(aAllowed[i]) !== '') {
                        cleanedTag = InkUtilString.trim(aAllowed[i].replace(/(<|\>)/g, '').replace(/\s/, ''));
                        aNewAllowed.push('(<'+cleanedTag+'\\s[^>]+>|<(\\s|\\/)?(\\s|\\/)?'+cleanedTag+'>)');
                    }
                }
                var strAllowed = aNewAllowed.join('|');
                var reAllowed = new RegExp(strAllowed, "i");

                var aFoundTags = string.match(new RegExp("<[^>]*>", "g"));

                for(var j=0; j < aFoundTags.length; j++) {
                    if(!aFoundTags[j].match(reAllowed)) {
                        string = string.replace((new RegExp(aFoundTags[j], "gm")), '');
                    }
                }
                return string;
            } else {
                return string.replace(/<[^\>]+\>/g, '');
            }
        },

        /**
         * Encodes string into HTML entities.
         *
         * @method htmlEntitiesEncode
         * @param {String} string
         * @return {String} string encoded
         * @public
         * @static
         * @sample Ink_Util_String_htmlEntitiesEncode.html 
         */
        htmlEntitiesEncode: function(string)
        {
            if (string && string.replace) {
                var re = false;
                for (var i = 0; i < InkUtilString._chars.length; i++) {
                    re = new RegExp(InkUtilString._chars[i], "gm");
                    string = string.replace(re, '&' + InkUtilString._entities[i] + ';');
                }
            }
            return string;
        },

        /**
         * Decodes string from HTML entities.
         *
         * @method htmlEntitiesDecode
         * @param   {String}    string  String to be decoded
         * @return  {String}            Decoded string
         * @public
         * @static
         * @sample Ink_Util_String_htmlEntitiesDecode.html 
         */
        htmlEntitiesDecode: function(string)
        {
            if (string && string.replace) {
                var re = false;
                for (var i = 0; i < InkUtilString._entities.length; i++) {
                    re = new RegExp("&"+InkUtilString._entities[i]+";", "gm");
                    string = string.replace(re, InkUtilString._chars[i]);
                }
                string = string.replace(/&#[^;]+;?/g, function($0){
                    if ($0.charAt(2) === 'x') {
                        return String.fromCharCode(parseInt($0.substring(3), 16));
                    }
                    else {
                        return String.fromCharCode(parseInt($0.substring(2), 10));
                    }
                });
            }
            return string;
        },

        /**
         * Encode a string to UTF-8.
         *
         * @method utf8Encode
         * @param   {String}    string      String to be encoded
         * @return  {String}    string      UTF-8 encoded string
         * @public
         * @static
         */
        utf8Encode: function(string) {
            /*jshint bitwise:false*/
            string = string.replace(/\r\n/g,"\n");
            var utfstring = "";

            for (var n = 0; n < string.length; n++) {

                var c = string.charCodeAt(n);

                if (c < 128) {
                    utfstring += String.fromCharCode(c);
                }
                else if((c > 127) && (c < 2048)) {
                    utfstring += String.fromCharCode((c >> 6) | 192);
                    utfstring += String.fromCharCode((c & 63) | 128);
                }
                else {
                    utfstring += String.fromCharCode((c >> 12) | 224);
                    utfstring += String.fromCharCode(((c >> 6) & 63) | 128);
                    utfstring += String.fromCharCode((c & 63) | 128);
                }

            }
            return utfstring;
        },

        /**
         * Truncates a string without breaking words.
         *
         * @method shortString
         * @param   {String}    str     String to truncate
         * @param   {Number}    n       Number of chars of the short string
         * @return  {String}        
         * @public
         * @static
         * @sample Ink_Util_String_shortString.html 
         */
        shortString: function(str,n) {
          var words = str.split(' ');
          var resultstr = '';
          for(var i = 0; i < words.length; i++ ){
            if((resultstr + words[i] + ' ').length>=n){
              resultstr += '&hellip;';
              break;
              }
            resultstr += words[i] + ' ';
            }
          return resultstr;
        },

        /**
         * Truncates a string, breaking words and adding ... at the end.
         *
         * @method truncateString
         * @param   {String} str        String to truncate
         * @param   {Number} length     Limit for the returned string, ellipsis included.
         * @return  {String}            Truncated String
         * @public
         * @static
         * @sample Ink_Util_String_truncateString.html 
         */
        truncateString: function(str, length) {
            if(str.length - 1 > length) {
                return str.substr(0, length - 1) + "\u2026";
            } else {
                return str;
            }
        },

        /**
         * Decodes a string from UTF-8.
         *
         * @method utf8Decode
         * @param   {String} string     String to be decoded
         * @return  {String}            Decoded string
         * @public
         * @static
         */
        utf8Decode: function(utfstring) {
            /*jshint bitwise:false*/
            var string = "";
            var i = 0, c = 0, c2 = 0, c3 = 0;

            while ( i < utfstring.length ) {

                c = utfstring.charCodeAt(i);

                if (c < 128) {
                    string += String.fromCharCode(c);
                    i++;
                }
                else if((c > 191) && (c < 224)) {
                    c2 = utfstring.charCodeAt(i+1);
                    string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
                    i += 2;
                }
                else {
                    c2 = utfstring.charCodeAt(i+1);
                    c3 = utfstring.charCodeAt(i+2);
                    string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
                    i += 3;
                }

            }
            return string;
        },

        /**
         * Removes all accented characters from a string.
         *
         * @method removeAccentedChars
         * @param   {String} string     String to remove accents from
         * @return  {String}            String without accented chars
         * @public
         * @static
         * @sample Ink_Util_String_removeAccentedChars.html 
         */
        removeAccentedChars: function(string)
        {
            var newString = string;
            var re = false;
            for (var i = 0; i < InkUtilString._accentedChars.length; i++) {
                re = new RegExp(InkUtilString._accentedChars[i], "gm");
                newString = newString.replace(re, '' + InkUtilString._accentedRemovedChars[i] + '');
            }
            return newString;
        },

        /**
         * Count the number of occurrences of a specific needle in a haystack
         *
         * @method substrCount
         * @param   {String} haystack   String to search in
         * @param   {String} needle     String to search for
         * @return  {Number}            Number of occurrences
         * @public
         * @static
         * @sample Ink_Util_String_substrCount.html 
         */
        substrCount: function(haystack,needle)
        {
            return haystack ? haystack.split(needle).length - 1 : 0;
        },

        /**
         * Eval a JSON - We recommend you Ink.Util.Json
         *
         * @method evalJSON
         * @param   {String}    strJSON     JSON string to eval
         * @param   {Boolean}   sanitize    Flag to sanitize input
         * @return  {Object}                JS Object
         * @public
         * @static
         */
        evalJSON: function(strJSON, sanitize) {
            /* jshint evil:true */
            if( (typeof sanitize === 'undefined' || sanitize === null) || InkUtilString.isJSON(strJSON)) {
                try {
                    if(typeof(JSON) !== "undefined" && typeof(JSON.parse) !== 'undefined'){
                        return JSON.parse(strJSON);
                    }
                    return eval('('+strJSON+')');
                } catch(e) {
                    throw new Error('ERROR: Bad JSON string...');
                }
            }
        },

        /**
         * Checks if a string is a valid JSON object (string encoded)
         *
         * @method isJSON       
         * @param   {String}    str      String to check
         * @return  {Boolean}
         * @public
         * @static
         */
        isJSON: function(str)
        {
            str = str.replace(/\\./g, '@').replace(/"[^"\\\n\r]*"/g, '');
            return (/^[,:{}\[\]0-9.\-+Eaeflnr-u \n\r\t]*$/).test(str);
        },

        /**
         * Escapes unsafe html chars as HTML entities
         *
         * @method htmlEscapeUnsafe
         * @param {String} str String to escape
         * @return {String} Escaped string
         * @public
         * @static
         * @sample Ink_Util_String_htmlEscapeUnsafe.html 
         */
        htmlEscapeUnsafe: function(str){
            var chars = InkUtilString._htmlUnsafeChars;
            return str !== null ? String(str).replace(/[<>&'"]/g,function(c){return chars[c];}) : str;
        },

        /**
         * Normalizes whitespace in string.
         * String is trimmed and sequences of whitespaces are collapsed.
         *
         * @method normalizeWhitespace
         * @param   {String}    str     String to normalize
         * @return  {String}            Normalized string
         * @public
         * @static
         * @sample Ink_Util_String_normalizeWhitespace.html 
         */
        normalizeWhitespace: function(str){
            return str !== null ? InkUtilString.trim(String(str).replace(/\s+/g,' ')) : str;
        },

        /**
         * Converts string to unicode.
         *
         * @method toUnicode
         * @param   {String} str    String to convert
         * @return  {String}        Unicoded String
         * @public
         * @static
         * @sample Ink_Util_String_toUnicode.html 
         */
        toUnicode: function(str) {
            if (typeof str === 'string') {
                var unicodeString = '';
                var inInt = false;
                var theUnicode = false;
                var total = str.length;
                var i=0;

                while(i < total)
                {
                    inInt = str.charCodeAt(i);
                    if( (inInt >= 32 && inInt <= 126) ||
                            inInt === 8 ||
                            inInt === 9 ||
                            inInt === 10 ||
                            inInt === 12 ||
                            inInt === 13 ||
                            inInt === 32 ||
                            inInt === 34 ||
                            inInt === 47 ||
                            inInt === 58 ||
                            inInt === 92) {

                        /*
                        if(inInt == 34 || inInt == 92 || inInt == 47) {
                            theUnicode = '\\'+str.charAt(i);
                        } else {
                        }
                        */
                        if(inInt === 8) {
                            theUnicode = '\\b';
                        } else if(inInt === 9) {
                            theUnicode = '\\t';
                        } else if(inInt === 10) {
                            theUnicode = '\\n';
                        } else if(inInt === 12) {
                            theUnicode = '\\f';
                        } else if(inInt === 13) {
                            theUnicode = '\\r';
                        } else {
                            theUnicode = str.charAt(i);
                        }
                    } else {
                        theUnicode = str.charCodeAt(i).toString(16)+''.toUpperCase();
                        while (theUnicode.length < 4) {
                            theUnicode = '0' + theUnicode;
                        }
                        theUnicode = '\\u' + theUnicode;
                    }
                    unicodeString += theUnicode;

                    i++;
                }
                return unicodeString;
            }
        },

        /**
         * Escapes a unicode character.
         *
         * @method escape
         * @param {String}  c   Character to escape
         * @return {String} Escaped character. Returns \xXX if hex smaller than 0x100, otherwise \uXXXX
         * @public
         * @static
         * @sample Ink_Util_String_escape.html 
         */
        escape: function(c) {
            var hex = (c).charCodeAt(0).toString(16).split('');
            if (hex.length < 3) {
                while (hex.length < 2) { hex.unshift('0'); }
                hex.unshift('x');
            }
            else {
                while (hex.length < 4) { hex.unshift('0'); }
                hex.unshift('u');
            }

            hex.unshift('\\');
            return hex.join('');
        },

        /**
         * Unescapes a unicode character escape sequence
         *
         * @method unescape
         * @param   {String} es     Escape sequence
         * @return  {String}        String un-unicoded
         * @public
         * @static
         * @sample Ink_Util_String_unescape.html 
         */
        unescape: function(es) {
            var idx = es.lastIndexOf('0');
            idx = idx === -1 ? 2 : Math.min(idx, 2);
            //console.log(idx);
            var hexNum = es.substring(idx);
            //console.log(hexNum);
            var num = parseInt(hexNum, 16);
            return String.fromCharCode(num);
        },

        /**
         * Escapes a string to unicode characters
         *
         * @method escapeText
         * @param   {String}    txt             
         * @param   {Array}     [whiteList]     Whitelist of characters
         * @return  {String}                    String escaped to Unicode
         * @public
         * @static
         * @sample Ink_Util_String_escapeText.html 
         */
        escapeText: function(txt, whiteList) {
            if (whiteList === undefined) {
                whiteList = ['[', ']', '\'', ','];
            }
            var txt2 = [];
            var c, C;
            for (var i = 0, f = txt.length; i < f; ++i) {
                c = txt[i];
                C = c.charCodeAt(0);
                if (C < 32 || C > 126 && whiteList.indexOf(c) === -1) {
                    c = InkUtilString.escape(c);
                }
                txt2.push(c);
            }
            return txt2.join('');
        },

        /**
         * Regex to check escaped strings
         *
         * @property escapedCharRegex
         * @type {Regex}
         * @public
         * @readOnly
         * @static
         */
        escapedCharRegex: /(\\x[0-9a-fA-F]{2})|(\\u[0-9a-fA-F]{4})/g,

        /**
         * Unescapes a string
         *
         * @method unescapeText
         * @param {String} txt
         * @return {String} Unescaped string
         * @public
         * @static
         * @sample Ink_Util_String_unescapeText.html 
         */
        unescapeText: function(txt) {
            /*jshint boss:true */
            var m;
            while (m = InkUtilString.escapedCharRegex.exec(txt)) {
                m = m[0];
                txt = txt.replace(m, InkUtilString.unescape(m));
                InkUtilString.escapedCharRegex.lastIndex = 0;
            }
            return txt;
        },

        /**
         * Compares two strings.
         *
         * @method strcmp
         * @param   {String}    str1     First String
         * @param   {String}    str2     Second String
         * @return  {Number}
         * @public
         * @static
         * @sample Ink_Util_String_strcmp.html 
         */
        strcmp: function(str1, str2) {
            return ((str1 === str2) ? 0 : ((str1 > str2) ? 1 : -1));
        },

        /**
         * Splits a string into smaller chunks
         *
         * @method packetize
         * @param   {String} str        String to divide
         * @param   {Number} maxLen     Maximum chunk size (in characters)
         * @return  {Array}             Chunks of the original string
         * @public
         * @static
         * @sample Ink_Util_String_packetize.html 
         */
        packetize: function(str, maxLen) {
            var len = str.length;
            var parts = new Array( Math.ceil(len / maxLen) );
            var chars = str.split('');
            var sz, i = 0;
            while (len) {
                sz = Math.min(maxLen, len);
                parts[i++] = chars.splice(0, sz).join('');
                len -= sz;
            }
            return parts;
        }
    };

    return InkUtilString;

});

/**
 * URL Utilities
 * @module Ink.Util.Url_1
 * @version 1
 */

Ink.createModule('Ink.Util.Url', '1', [], function() {

    'use strict';

    /**
     * @namespace Ink.Util.Url_1
     */
    var Url = {

        /**
         * Auxiliary string for encoding
         *
         * @property _keyStr
         * @type {String}
         * @readOnly
         * @private
         */
        _keyStr : 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=',


        /**
         * Gets URL of current page
         *
         * @method getUrl
         * @return Current URL
         * @public
         * @static
         * @sample Ink_Util_Url_getUrl.html 
         */
        getUrl: function()
        {
            return window.location.href;
        },

        /**
         * Generates an URL string.
         *
         * @method genQueryString
         * @param {String} uri      Base URL
         * @param {Object} params   Object to transform to query string
         * @return {String} URI with query string set
         * @public
         * @static
         * @sample Ink_Util_Url_genQueryString.html 
         */
        genQueryString: function(uri, params) {
            var hasQuestionMark = uri.indexOf('?') !== -1;
            var sep, pKey, pValue, parts = [uri];

            for (pKey in params) {
                if (params.hasOwnProperty(pKey)) {
                    if (!hasQuestionMark) {
                        sep = '?';
                        hasQuestionMark = true;
                    } else {
                        sep = '&';
                    }
                    pValue = params[pKey];
                    if (typeof pValue !== 'number' && !pValue) {
                        pValue = '';
                    }
                    parts = parts.concat([sep, encodeURIComponent(pKey), '=', encodeURIComponent(pValue)]);
                }
            }

            return parts.join('');
        },

        /**
         * Gets an object from an URL encoded string.
         *
         * @method getQueryString
         * @param   {String} [str]      URL String. When not specified it uses the current URL.
         * @return  {Object}            Key-Value pair object
         * @public
         * @static
         * @sample Ink_Util_Url_getQueryString.html 
         */
        getQueryString: function(str)
        {
            var url;
            if(str && typeof(str) !== 'undefined') {
                url = str;
            } else {
                url = this.getUrl();
            }
            var aParams = {};
            if(url.match(/\?(.+)/i)) {
                var queryStr = url.replace(/^(.*)\?([^\#]+)(\#(.*))?/g, "$2");
                if(queryStr.length > 0) {
                    var aQueryStr = queryStr.split(/[;&]/);
                    for(var i=0; i < aQueryStr.length; i++) {
                        var pairVar = aQueryStr[i].split('=');
                        aParams[decodeURIComponent(pairVar[0])] = (typeof(pairVar[1]) !== 'undefined' && pairVar[1]) ? decodeURIComponent(pairVar[1]) : false;
                    }
                }
            }
            return aParams;
        },

        /**
         * Gets the URL hash value
         *
         * @method getAnchor
         * @param   {String}            [str]   URL String. Defaults to current page URL.
         * @return  {String|Boolean}            Hash in the URL. If there's no hash, returns false.
         * @public
         * @static
         * @sample Ink_Util_Url_getAnchor.html 
         */
        getAnchor: function(str)
        {
            var url;
            if(str && typeof(str) !== 'undefined') {
                url = str;
            } else {
                url = this.getUrl();
            }
            var anchor = false;
            if(url.match(/#(.+)/)) {
                anchor = url.replace(/([^#]+)#(.*)/, "$2");
            }
            return anchor;
        },

        /**
         * Gets the anchor string of an URL
         *
         * @method getAnchorString
         * @param   {String} [string]   URL to parse. Defaults to current URL.
         * @return  {Object}            Key-value pair object of the URL's hashtag 'variables'
         * @public
         * @static
         * @sample Ink_Util_Url_getAnchorString.html 
         */
        getAnchorString: function(string)
        {
            var url;
            if(string && typeof(string) !== 'undefined') {
                url = string;
            } else {
                url = this.getUrl();
            }
            var aParams = {};
            if(url.match(/#(.+)/i)) {
                var anchorStr = url.replace(/^([^#]+)#(.*)?/g, "$2");
                if(anchorStr.length > 0) {
                    var aAnchorStr = anchorStr.split(/[;&]/);
                    for(var i=0; i < aAnchorStr.length; i++) {
                        var pairVar = aAnchorStr[i].split('=');
                        aParams[decodeURIComponent(pairVar[0])] = (typeof(pairVar[1]) !== 'undefined' && pairVar[1]) ? decodeURIComponent(pairVar[1]) : false;
                    }
                }
            }
            return aParams;
        },


        /**
         * Parses URL string into URL parts
         *
         * @method parseUrl
         * @param {String} url URL to be parsed
         * @return {Object} Parsed URL as a key-value object.
         * @public
         * @static
         * @sample Ink_Util_Url_parseUrl.html 
         */
        parseUrl: function(url) {
            var aURL = {};
            if(url && typeof url === 'string') {
                if(url.match(/^([^:]+):\/\//i)) {
                    var re = /^([^:]+):\/\/([^\/]*)\/?([^\?#]*)\??([^#]*)#?(.*)/i;
                    if(url.match(re)) {
                        aURL.scheme   = url.replace(re, "$1");
                        aURL.host     = url.replace(re, "$2");
                        aURL.path     = '/'+url.replace(re, "$3");
                        aURL.query    = url.replace(re, "$4") || false;
                        aURL.fragment = url.replace(re, "$5") || false;
                    }
                } else {
                    var re1 = new RegExp("^([^\\?]+)\\?([^#]+)#(.*)", "i");
                    var re2 = new RegExp("^([^\\?]+)\\?([^#]+)#?", "i");
                    var re3 = new RegExp("^([^\\?]+)\\??", "i");
                    if(url.match(re1)) {
                        aURL.scheme   = false;
                        aURL.host     = false;
                        aURL.path     = url.replace(re1, "$1");
                        aURL.query    = url.replace(re1, "$2");
                        aURL.fragment = url.replace(re1, "$3");
                    } else if(url.match(re2)) {
                        aURL.scheme = false;
                        aURL.host   = false;
                        aURL.path   = url.replace(re2, "$1");
                        aURL.query  = url.replace(re2, "$2");
                        aURL.fragment = false;
                    } else if(url.match(re3)) {
                        aURL.scheme   = false;
                        aURL.host     = false;
                        aURL.path     = url.replace(re3, "$1");
                        aURL.query    = false;
                        aURL.fragment = false;
                    }
                }
                if(aURL.host) {
                    var regPort = /^(.*?)\\:(\\d+)$/i;
                    // check for port
                    if(aURL.host.match(regPort)) {
                        var tmpHost1 = aURL.host;
                        aURL.host = tmpHost1.replace(regPort, "$1");
                        aURL.port = tmpHost1.replace(regPort, "$2");
                    } else {
                        aURL.port = false;
                    }
                    // check for user and pass
                    if(aURL.host.match(/@/i)) {
                        var tmpHost2 = aURL.host;
                        aURL.host = tmpHost2.split('@')[1];
                        var tmpUserPass = tmpHost2.split('@')[0];
                        if(tmpUserPass.match(/\:/)) {
                            aURL.user = tmpUserPass.split(':')[0];
                            aURL.pass = tmpUserPass.split(':')[1];
                        } else {
                            aURL.user = tmpUserPass;
                            aURL.pass = false;
                        }
                    }
                }
            }
            return aURL;
        },

        /**
         * Formats an URL object into an URL string.
         *
         * @method format
         * @param urlObj Window.location, a.href, or parseUrl object to format
         * @return {String} Full URL.
         */
        format: function (urlObj) {
            var protocol = '';
            var host = '';
            var path = '';
            var frag = '';
            var query = '';

            if (typeof urlObj.protocol === 'string') {
                protocol = urlObj.protocol + '//';  // here it comes with the colon
            } else if (typeof urlObj.scheme === 'string')  {
                protocol = urlObj.scheme + '://';
            }

            host = urlObj.host || urlObj.hostname || '';
            path = urlObj.path || '';

            if (typeof urlObj.query === 'string') {
                query = urlObj.query;
            } else if (typeof urlObj.search === 'string') {
                query = urlObj.search.replace(/^\?/, '');
            }
            if (typeof urlObj.fragment === 'string') {
                frag =  urlObj.fragment;
            } else if (typeof urlObj.hash === 'string') {
                frag = urlObj.hash.replace(/#$/, '');
            }

            return [
                protocol,
                host,
                path,
                query && '?' + query,
                frag && '#' + frag
            ].join('');
        },

        /**
         * Gets the last loaded script element
         *
         * @method currentScriptElement
         * @param {String} [match] String to match against the script src attribute
         * @return {DOMElement|Boolean} Returns the `script` DOM Element or false if unable to find it.
         * @public
         * @static
         * @sample Ink_Util_Url_currentScriptElement.html 
         */
        currentScriptElement: function(match)
        {
            var aScripts = document.getElementsByTagName('script');
            if(typeof(match) === 'undefined') {
                if(aScripts.length > 0) {
                    return aScripts[(aScripts.length - 1)];
                } else {
                    return false;
                }
            } else {
                var curScript = false;
                var re = new RegExp(""+match+"", "i");
                for(var i=0, total = aScripts.length; i < total; i++) {
                    curScript = aScripts[i];
                    if(re.test(curScript.src)) {
                        return curScript;
                    }
                }
                return false;
            }
        },

        
        /*
        base64Encode: function(string)
        {
            /**
         * --function {String} ?
         * --Convert a string to BASE 64
         * @param {String} string - string to convert
         * @return base64 encoded string
         *
         * 
            if(!SAPO.Utility.String || typeof(SAPO.Utility.String) === 'undefined') {
                throw "SAPO.Utility.Url.base64Encode depends of SAPO.Utility.String, which has not been referred.";
            }

            var output = "";
            var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
            var i = 0;

            var input = SAPO.Utility.String.utf8Encode(string);

            while (i < input.length) {

                chr1 = input.charCodeAt(i++);
                chr2 = input.charCodeAt(i++);
                chr3 = input.charCodeAt(i++);

                enc1 = chr1 >> 2;
                enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
                enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
                enc4 = chr3 & 63;

                if (isNaN(chr2)) {
                    enc3 = enc4 = 64;
                } else if (isNaN(chr3)) {
                    enc4 = 64;
                }

                output = output +
                this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
                this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);
            }
            return output;
        },
        base64Decode: function(string)
        {
         * --function {String} ?
         * Decode a BASE 64 encoded string
         * --param {String} string base64 encoded string
         * --return string decoded
            if(!SAPO.Utility.String || typeof(SAPO.Utility.String) === 'undefined') {
                throw "SAPO.Utility.Url.base64Decode depends of SAPO.Utility.String, which has not been referred.";
            }

            var output = "";
            var chr1, chr2, chr3;
            var enc1, enc2, enc3, enc4;
            var i = 0;

            var input = string.replace(/[^A-Za-z0-9\+\/\=]/g, "");

            while (i < input.length) {

                enc1 = this._keyStr.indexOf(input.charAt(i++));
                enc2 = this._keyStr.indexOf(input.charAt(i++));
                enc3 = this._keyStr.indexOf(input.charAt(i++));
                enc4 = this._keyStr.indexOf(input.charAt(i++));

                chr1 = (enc1 << 2) | (enc2 >> 4);
                chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
                chr3 = ((enc3 & 3) << 6) | enc4;

                output = output + String.fromCharCode(chr1);

                if (enc3 !== 64) {
                    output = output + String.fromCharCode(chr2);
                }
                if (enc4 !== 64) {
                    output = output + String.fromCharCode(chr3);
                }
            }
            output = SAPO.Utility.String.utf8Decode(output);
            return output;
        },
        */


        /**
         * Debug function ?
         *
         * @method _debug
         * @private
         * @static
         */
        _debug: function() {}

    };

    return Url;

});

/**
 * Validation Utilities
 * @module Ink.Util.Validator_1
 * @version 1
 */
 
Ink.createModule('Ink.Util.Validator', '1', [], function() {

    'use strict';

    /**
     * @namespace Ink.Util.Validator_1 
     */
    var Validator = {

        /**
         * List of country codes avaible for the isPhone method
         *
         * @property _countryCodes
         * @type {Array}
         * @private
         * @static
         * @readOnly
         */
        _countryCodes : [
                        'AO',
                        'CV',
                        'MZ',
                        'PT'
                    ],

        /**
         * International number for portugal
         *
         * @property _internacionalPT
         * @type {Number}
         * @private
         * @static
         * @readOnly
         *
         */
        _internacionalPT: 351,

        /**
         * List of all portuguese number prefixes
         *
         * @property _indicativosPT
         * @type {Object}
         * @private
         * @static
         * @readOnly
         *
         */
        _indicativosPT: {
                        21: 'lisboa',
                        22: 'porto',
                        231: 'mealhada',
                        232: 'viseu',
                        233: 'figueira da foz',
                        234: 'aveiro',
                        235: 'arganil',
                        236: 'pombal',
                        238: 'seia',
                        239: 'coimbra',
                        241: 'abrantes',
                        242: 'ponte de sôr',
                        243: 'santarém',
                        244: 'leiria',
                        245: 'portalegre',
                        249: 'torres novas',
                        251: 'valença',
                        252: 'vila nova de famalicão',
                        253: 'braga',
                        254: 'peso da régua',
                        255: 'penafiel',
                        256: 'são joão da madeira',
                        258: 'viana do castelo',
                        259: 'vila real',
                        261: 'torres vedras',
                        262: 'caldas da raínha',
                        263: 'vila franca de xira',
                        265: 'setúbal',
                        266: 'évora',
                        268: 'estremoz',
                        269: 'santiago do cacém',
                        271: 'guarda',
                        272: 'castelo branco',
                        273: 'bragança',
                        274: 'proença-a-nova',
                        275: 'covilhã',
                        276: 'chaves',
                        277: 'idanha-a-nova',
                        278: 'mirandela',
                        279: 'moncorvo',
                        281: 'tavira',
                        282: 'portimão',
                        283: 'odemira',
                        284: 'beja',
                        285: 'moura',
                        286: 'castro verde',
                        289: 'faro',
                        291: 'funchal, porto santo',
                        292: 'corvo, faial, flores, horta, pico',
                        295: 'angra do heroísmo, graciosa, são jorge, terceira',
                        296: 'ponta delgada, são miguel, santa maria',

                        91 : 'rede móvel 91 (Vodafone / Yorn)',
                        93 : 'rede móvel 93 (Optimus)',
                        96 : 'rede móvel 96 (TMN)',
                        92 : 'rede móvel 92 (TODOS)',
                        //925 : 'rede móvel 925 (TMN 925)',
                        //926 : 'rede móvel 926 (TMN 926)',
                        //927 : 'rede móvel 927 (TMN 927)',
                        //922 : 'rede móvel 922 (Phone-ix)',

                        707: 'número único',
                        760: 'número único',
                        800: 'número grátis',
                        808: 'chamada local',
                        30:  'voip'
                          },
        /**
         * International number for Cabo Verde
         *
         * @property _internacionalCV
         * @type {Number}
         * @private
         * @static
         * @readOnly
         */
        _internacionalCV: 238,

        /**
         * List of all Cabo Verde number prefixes
         *
         * @property _indicativosCV
         * @type {Object}
         * @private
         * @static
         * @readOnly
         */
        _indicativosCV: {
                        2: 'fixo',
                        91: 'móvel 91',
                        95: 'móvel 95',
                        97: 'móvel 97',
                        98: 'móvel 98',
                        99: 'móvel 99'
                    },
        /**
         * International number for Angola
         *
         * @property _internacionalAO
         * @type {Number}
         * @private
         * @static
         * @readOnly
         */
        _internacionalAO: 244,

        /**
         * List of all Angola number prefixes
         *
         * @property _indicativosAO
         * @type {Object}
         * @private
         * @static
         * @readOnly
         */
        _indicativosAO: {
                        2: 'fixo',
                        91: 'móvel 91',
                        92: 'móvel 92'
                    },
        /**
         * International number for Mozambique
         *
         * @property _internacionalMZ
         * @type {Number}
         * @private
         * @static
         * @readOnly
         */
        _internacionalMZ: 258,

        /**
         * List of all Mozambique number prefixes
         *
         * @property _indicativosMZ
         * @type {Object}
         * @private
         * @static
         * @readOnly
         */
        _indicativosMZ: {
                        2: 'fixo',
                        82: 'móvel 82',
                        84: 'móvel 84'
                    },

        /**
         * International number for Timor
         *
         * @property _internacionalTL
         * @type {Number}
         * @private
         * @static
         * @readOnly
         */
        _internacionalTL: 670,

        /**
         * List of all Timor number prefixes
         *
         * @property _indicativosTL
         * @type {Object}
         * @private
         * @static
         * @readOnly
         */
        _indicativosTL: {
                        3: 'fixo',
                        7: 'móvel 7'
                    },

        /**
         * Regular expression groups for several groups of characters
         *
         * http://en.wikipedia.org/wiki/C0_Controls_and_Basic_Latin
         * http://en.wikipedia.org/wiki/Plane_%28Unicode%29#Basic_Multilingual_Plane
         * http://en.wikipedia.org/wiki/ISO_8859-1
         *
         * @property _characterGroups
         * @type {Object}
         * @private
         * @static
         * @readOnly
         */
        _characterGroups: {
            numbers: ['0-9'],
            asciiAlpha: ['a-zA-Z'],
            latin1Alpha: ['a-zA-Z', '\u00C0-\u00FF'],
            unicodeAlpha: ['a-zA-Z', '\u00C0-\u00FF', '\u0100-\u1FFF', '\u2C00-\uD7FF'],
            /* whitespace characters */
            space: [' '],
            dash: ['-'],
            underscore: ['_'],
            nicknamePunctuation: ['_.-'],

            singleLineWhitespace: ['\t '],
            newline: ['\n'],
            whitespace: ['\t\n\u000B\f\r\u00A0 '],

            asciiPunctuation: ['\u0021-\u002F', '\u003A-\u0040', '\u005B-\u0060', '\u007B-\u007E'],
            latin1Punctuation: ['\u0021-\u002F', '\u003A-\u0040', '\u005B-\u0060', '\u007B-\u007E', '\u00A1-\u00BF', '\u00D7', '\u00F7'],
            unicodePunctuation: ['\u0021-\u002F', '\u003A-\u0040', '\u005B-\u0060', '\u007B-\u007E', '\u00A1-\u00BF', '\u00D7', '\u00F7', '\u2000-\u206F', '\u2E00-\u2E7F', '\u3000-\u303F']
        },

        /**
         * Creates a regular expression for several character groups.
         *
         * @method createRegExp
         *
         * @param Groups* {Object}
         *  Groups to build regular expressions for. Possible keys are:
         *
         * - **numbers**: 0-9
         * - **asciiAlpha**: a-z, A-Z
         * - **latin1Alpha**: asciiAlpha, plus printable characters in latin-1
         * - **unicodeAlpha**: unicode alphanumeric characters.
         * - **space**: ' ', the space character.
         * - **dash**: dash character.
         * - **underscore**: underscore character.
         * - **nicknamePunctuation**: dash, dot, underscore
         * - **singleLineWhitespace**: space and tab (whitespace which only spans one line).
         * - **newline**: newline character ('\n')
         * - **whitespace**: whitespace characters in the ASCII character set.
         * - **asciiPunctuation**: punctuation characters in the ASCII character set.
         * - **latin1Punctuation**: punctuation characters in latin-1.
         * - **unicodePunctuation**: punctuation characters in unicode.
         *
         */
        createRegExp: function (groups) {
            var re = '^[';
            for (var key in groups) if (groups.hasOwnProperty(key)) {
                if (!(key in Validator._characterGroups)) {
                    throw new Error('group ' + key + ' is not a valid character group');
                } else if (groups[key]) {
                    re += Validator._characterGroups[key].join('');
                }
            }
            return new RegExp(re + ']*?$');
        },

        /**
         * Checks if a field has the required groups.
         *
         * @method checkCharacterGroups
         * @param {String}  s               The validation string
         * @param {Object}  [groups]={}     What groups are included. See createRegexp
         * @sample Ink_Util_Validator_checkCharacterGroups.html 
         */
        checkCharacterGroups: function (s, groups) {
            return Validator.createRegExp(groups).test(s);
        },

        /**
         * Checks if a field contains unicode printable characters.
         *
         * @method unicode
         * @param {String}  s               The validation string
         * @param {Object}  [options]={}    Optional configuration object. See createRegexp
         */
        unicode: function (s, options) {
            return Validator.checkCharacterGroups(s, Ink.extendObj({
                unicodeAlpha: true}, options));
        },

        /**
         * Checks if a field only contains latin-1 alphanumeric characters. 
         * Takes options for allowing singleline whitespace, cross-line whitespace and punctuation.
         *
         * @method latin1
         *
         * @param {String}  s               The validation string
         * @param {Object}  [options]={}    Optional configuration object. See createRegexp
         * @sample Ink_Util_Validator_latin1.html  
         */
        latin1: function (s, options) {
            return Validator.checkCharacterGroups(s, Ink.extendObj({
                latin1Alpha: true}, options));
        },

        /**
         * Checks if a field only contains only ASCII alphanumeric characters. 
         * Takes options for allowing singleline whitespace, cross-line whitespace and punctuation.
         *
         * @method ascii
         *
         * @param {String}  s               The validation string
         * @param {Object}  [options]={}    Optional configuration object. See createRegexp
         * @sample Ink_Util_Validator_ascii.html 
         */
        ascii: function (s, options) {
            return Validator.checkCharacterGroups(s, Ink.extendObj({
                asciiAlpha: true}, options));
        },

        /**
         * Checks if a number is a valid
         *
         * @method number
         * @param {String} numb         The number
         * @param {Object} [options]    Further options
         *  @param  [options.decimalSep]='.'    Allow decimal separator.
         *  @param  [options.thousandSep]=","   Strip this character from the number.
         *  @param  [options.negative]=false    Allow negative numbers.
         *  @param  [options.decimalPlaces]=null   Maximum number of decimal places. Use `0` for an integer number.
         *  @param  [options.max]=null          Maximum number
         *  @param  [options.min]=null          Minimum number
         *  @param  [options.returnNumber]=false When this option is true, return the number itself when the value is valid.
         *  @sample Ink_Util_Validator_number.html 
         */
        number: function (numb, inOptions) {
            numb = numb + '';
            var options = Ink.extendObj({
                decimalSep: '.',
                thousandSep: '',
                negative: true,
                decimalPlaces: null,
                maxDigits: null,
                max: null,
                min: null,
                returnNumber: false
            }, inOptions || {});
            // smart recursion thing sets up aliases for options.
            if (options.thousandSep) {
                numb = numb.replace(new RegExp('\\' + options.thousandSep, 'g'), '');
                options.thousandSep = '';
                return Validator.number(numb, options);
            }
            if (options.negative === false) {
                options.min = 0;
                options.negative = true;
                return Validator.number(numb, options);
            }
            if (options.decimalSep !== '.') {
                numb = numb.replace(new RegExp('\\' + options.decimalSep, 'g'), '.');
            }

            if (!/^(-)?(\d+)?(\.\d+)?$/.test(numb) || numb === '') {
                return false;  // forbidden character found
            }
            
            var split;
            if (options.decimalSep && numb.indexOf(options.decimalSep) !== -1) {
                split = numb.split(options.decimalSep);
                if (options.decimalPlaces !== null &&
                        split[1].length > options.decimalPlaces) {
                    return false;
                }
            } else {
                split = ['' + numb, ''];
            }
            
            if (options.maxDigits!== null) {
                if (split[0].replace(/-/g, '').length > options.maxDigits) {
                    return split;
                }
            }
            
            // Now look at the actual float
            var ret = parseFloat(numb);
            
            if (options.maxExcl !== null && ret >= options.maxExcl ||
                    options.minExcl !== null && ret <= options.minExcl) {
                return false;
            }
            if (options.max !== null && ret > options.max ||
                    options.min !== null && ret < options.min) {
                return false;
            }
            
            if (options.returnNumber) {
                return ret;
            } else {
                return true;
            }
        },

        /**
         * Checks if a year is Leap "Bissexto"
         *
         * @method _isLeapYear
         * @param {Number} year Year to be checked
         * @return {Boolean} True if it is a leap year.
         * @private
         * @static
         * @example
         *     Ink.requireModules(['Ink.Util.Validator_1'], function( InkValidator ){
         *         console.log( InkValidator._isLeapYear( 2004 ) ); // Result: true
         *         console.log( InkValidator._isLeapYear( 2006 ) ); // Result: false
         *     });
         */
        _isLeapYear: function(year){

            var yearRegExp = /^\d{4}$/;

            if(yearRegExp.test(year)){
                return ((year%4) ? false: ((year%100) ? true : ((year%400)? false : true)) );
            }

            return false;
        },

        /**
         * Object with the date formats available for validation
         *
         * @property _dateParsers
         * @type {Object}
         * @private
         * @static
         * @readOnly
         */
        _dateParsers: {
            'yyyy-mm-dd': {day:5, month:3, year:1, sep: '-', parser: /^(\d{4})(\-)(\d{1,2})(\-)(\d{1,2})$/},
            'yyyy/mm/dd': {day:5, month:3, year:1, sep: '/', parser: /^(\d{4})(\/)(\d{1,2})(\/)(\d{1,2})$/},
            'yy-mm-dd': {day:5, month:3, year:1, sep: '-', parser: /^(\d{2})(\-)(\d{1,2})(\-)(\d{1,2})$/},
            'yy/mm/dd': {day:5, month:3, year:1, sep: '/', parser: /^(\d{2})(\/)(\d{1,2})(\/)(\d{1,2})$/},
            'dd-mm-yyyy': {day:1, month:3, year:5, sep: '-', parser: /^(\d{1,2})(\-)(\d{1,2})(\-)(\d{4})$/},
            'dd/mm/yyyy': {day:1, month:3, year:5, sep: '/', parser: /^(\d{1,2})(\/)(\d{1,2})(\/)(\d{4})$/},
            'dd-mm-yy': {day:1, month:3, year:5, sep: '-', parser: /^(\d{1,2})(\-)(\d{1,2})(\-)(\d{2})$/},
            'dd/mm/yy': {day:1, month:3, year:5, sep: '/', parser: /^(\d{1,2})(\/)(\d{1,2})(\/)(\d{2})$/}
        },

        /**
         * Gets the number of days in a given month of a given year
         *
         * @method _daysInMonth
         * @param {Number} _m Month (1 to 12)
         * @param {Number} _y Year
         * @return {Number} Returns the number of days in a given month of a given year
         * @private
         * @static
         * @example
         *     Ink.requireModules(['Ink.Util.Validator_1'], function( InkValidator ){
         *         console.log( InkValidator._daysInMonth( 2, 2004 ) ); // Result: 29
         *         console.log( InkValidator._daysInMonth( 2, 2006 ) ); // Result: 28
         *     });
         */
        _daysInMonth: function(_m,_y){
            var nDays=0;

            _m = parseInt(_m, 10);
            _y = parseInt(_y, 10);

            if(_m===1 || _m===3 || _m===5 || _m===7 || _m===8 || _m===10 || _m===12) {
                nDays= 31;
            } else if ( _m===4 || _m===6 || _m===9 || _m===11) {
                nDays = 30;
            } else if (_m===2) {
                if((_y%400===0) || (_y%4===0 && _y%100!==0)) {
                    nDays = 29;
                } else {
                    nDays = 28;
                }
            }

            return nDays;
        },



        /**
         * Checks if a date is valid
         *
         * @method _isValidDate
         * @param {Number} year
         * @param {Number} month
         * @param {Number} day
         * @return {Boolean} True if valid
         * @private
         * @static
         * @example
         *     Ink.requireModules(['Ink.Util.Validator_1'], function( InkValidator ){
         *         console.log( InkValidator._isValidDate( 2004, 2, 29 ) ); // Result: true
         *         console.log( InkValidator._isValidDate( 2006, 2, 29 ) ); // Result: false
         *     });
         */
        _isValidDate: function(year, month, day){

            var yearRegExp = /^\d{4}$/;
            var validOneOrTwo = /^\d{1,2}$/;
            if(yearRegExp.test(year) && validOneOrTwo.test(month) && validOneOrTwo.test(day)){
                if(month>=1 && month<=12 && day>=1 && this._daysInMonth(month,year)>=day){
                    return true;
                }
            }

            return false;
        },

        /**
         * Checks if an email is valid
         *
         * @method mail
         * @param {String} email
         * @return {Boolean} True if it's valid
         * @public
         * @static
         * @sample Ink_Util_Validator_mail.html 
         */
        email: function(email)
        {
            var emailValido = new RegExp("^[_a-z0-9-]+((\\.|\\+)[_a-z0-9-]+)*@([\\w]*-?[\\w]*\\.)+[a-z]{2,4}$", "i");
            if(!emailValido.test(email)) {
                return false;
            } else {
                return true;
            }
        },

        /**
         * Deprecated. Alias for email(). Use it instead.
         *
         * @method mail
         * @public
         * @static
         * @private
         */
        mail: function (mail) { return Validator.email(mail); },

        /**
         * Checks if an url is valid
         *
         * @method url
         * @param {String} url URL to be checked
         * @param {Boolean} [full] If true, validates a full URL (one that should start with 'http')
         * @return {Boolean} True if valid
         * @public
         * @static
         * @sample Ink_Util_Validator_url.html 
         */
        url: function(url, full)
        {
            if(typeof full === "undefined" || full === false) {
                var reHTTP = new RegExp("(^(http\\:\\/\\/|https\\:\\/\\/)(.+))", "i");
                if(reHTTP.test(url) === false) {
                    url = 'http://'+url;
                }
            }

            var reUrl = new RegExp("^(http:\\/\\/|https:\\/\\/)([\\w]*(-?[\\w]*)*\\.)+[a-z]{2,4}", "i");
            if(reUrl.test(url) === false) {
                return false;
            } else {
                return true;
            }
        },

        /**
         * Checks if a phone is valid in Portugal
         *
         * @method isPTPhone
         * @param {Number} phone Phone number to be checked
         * @return {Boolean} True if it's a valid Portuguese Phone
         * @public
         * @static
         * @sample Ink_Util_Validator_isPTPhone.html
         */
        isPTPhone: function(phone)
        {

            phone = phone.toString();
            var aInd = [];
            for(var i in this._indicativosPT) {
                if(typeof(this._indicativosPT[i]) === 'string') {
                    aInd.push(i);
                }
            }
            var strInd = aInd.join('|');

            var re351 = /^(00351|\+351)/;
            if(re351.test(phone)) {
                phone = phone.replace(re351, "");
            }

            var reSpecialChars = /(\s|\-|\.)+/g;
            phone = phone.replace(reSpecialChars, '');
            //var reInt = new RegExp("\\d", "i");
            var reInt = /[\d]{9}/i;
            if(phone.length === 9 && reInt.test(phone)) {
                var reValid = new RegExp("^("+strInd+")");
                if(reValid.test(phone)) {
                    return true;
                }
            }

            return false;
        },

        /**
         * Alias function for isPTPhone
         *
         * @method isPortuguesePhone
         * @param {Number} phone Phone number to be checked
         * @return {Boolean} True if it's a valid Portuguese Phone
         * @public
         * @static
         */
        isPortuguesePhone: function(phone)
        {
            return this.isPTPhone(phone);
        },

        /**
         * Checks if a phone is valid in Cabo Verde
         *
         * @method isCVPhone
         * @param {Number} phone Phone number to be checked
         * @return {Boolean} True if it's a valid Cape Verdean Phone
         * @public
         * @static
         * @sample Ink_Util_Validator_isCVPhone.html 
         */
        isCVPhone: function(phone)
        {
            phone = phone.toString();
            var aInd = [];
            for(var i in this._indicativosCV) {
                if(typeof(this._indicativosCV[i]) === 'string') {
                    aInd.push(i);
                }
            }
            var strInd = aInd.join('|');

            var re238 = /^(00238|\+238)/;
            if(re238.test(phone)) {
                phone = phone.replace(re238, "");
            }

            var reSpecialChars = /(\s|\-|\.)+/g;
            phone = phone.replace(reSpecialChars, '');
            //var reInt = new RegExp("\\d", "i");
            var reInt = /[\d]{7}/i;
            if(phone.length === 7 && reInt.test(phone)) {
                var reValid = new RegExp("^("+strInd+")");
                if(reValid.test(phone)) {
                    return true;
                }
            }

            return false;
        },

        /**
         * Checks if a phone is valid in Angola
         *
         * @method isAOPhone
         * @param {Number} phone Phone number to be checked
         * @return {Boolean} True if it's a valid Angolan Phone
         * @public
         * @static
         * @sample Ink_Util_Validator_isAOPhone.html 
         */
        isAOPhone: function(phone)
        {

            phone = phone.toString();
            var aInd = [];
            for(var i in this._indicativosAO) {
                if(typeof(this._indicativosAO[i]) === 'string') {
                    aInd.push(i);
                }
            }
            var strInd = aInd.join('|');

            var re244 = /^(00244|\+244)/;
            if(re244.test(phone)) {
                phone = phone.replace(re244, "");
            }

            var reSpecialChars = /(\s|\-|\.)+/g;
            phone = phone.replace(reSpecialChars, '');
            //var reInt = new RegExp("\\d", "i");
            var reInt = /[\d]{9}/i;
            if(phone.length === 9 && reInt.test(phone)) {
                var reValid = new RegExp("^("+strInd+")");
                if(reValid.test(phone)) {
                    return true;
                }
            }

            return false;
        },

        /**
         * Checks if a phone is valid in Mozambique
         *
         * @method isMZPhone
         * @param {Number} phone Phone number to be checked
         * @return {Boolean} True if it's a valid Mozambican Phone
         * @public
         * @static
         * @sample Ink_Util_Validator_isMZPhone.html 
         */
        isMZPhone: function(phone)
        {

            phone = phone.toString();
            var aInd = [];
            for(var i in this._indicativosMZ) {
                if(typeof(this._indicativosMZ[i]) === 'string') {
                    aInd.push(i);
                }
            }
            var strInd = aInd.join('|');
            var re258 = /^(00258|\+258)/;
            if(re258.test(phone)) {
                phone = phone.replace(re258, "");
            }

            var reSpecialChars = /(\s|\-|\.)+/g;
            phone = phone.replace(reSpecialChars, '');
            //var reInt = new RegExp("\\d", "i");
            var reInt = /[\d]{8,9}/i;
            if((phone.length === 9 || phone.length === 8) && reInt.test(phone)) {
                var reValid = new RegExp("^("+strInd+")");
                if(reValid.test(phone)) {
                   if(phone.indexOf('2') === 0 && phone.length === 8) {
                       return true;
                   } else if(phone.indexOf('8') === 0 && phone.length === 9) {
                       return true;
                   }
                }
            }

            return false;
        },

        /**
         * Checks if a phone is valid in Timor
         *
         * @method isTLPhone
         * @param {Number} phone Phone number to be checked
         * @return {Boolean} True if it's a valid phone from Timor-Leste
         * @public
         * @static
         * @sample Ink_Util_Validator_isTLPhone.html 
         */
        isTLPhone: function(phone)
        {

            phone = phone.toString();
            var aInd = [];
            for(var i in this._indicativosTL) {
                if(typeof(this._indicativosTL[i]) === 'string') {
                    aInd.push(i);
                }
            }
            var strInd = aInd.join('|');
            var re670 = /^(00670|\+670)/;
            if(re670.test(phone)) {
                phone = phone.replace(re670, "");
            }


            var reSpecialChars = /(\s|\-|\.)+/g;
            phone = phone.replace(reSpecialChars, '');
            //var reInt = new RegExp("\\d", "i");
            var reInt = /[\d]{7}/i;
            if(phone.length === 7 && reInt.test(phone)) {
                var reValid = new RegExp("^("+strInd+")");
                if(reValid.test(phone)) {
                    return true;
                }
            }

            return false;
        },

        /**
         * Checks if a number is a phone number.
         * This method validates the number in all country codes available the ones set in the second param
         *
         * @method isPhone
         * @param   {String}        phone           Phone number to validate
         * @param   {String|Array}  [countryCode]   Country code or  array of countries to validate
         * @return  {Boolean}                       True if it's a valid phone in any country available
         * @public
         * @static
         * @sample Ink_Util_Validator_isPhone.html
         */
        isPhone: function(){
            var index;

            if(arguments.length===0){
                return false;
            }

            var phone = arguments[0];

            if(arguments.length>1){
                if(arguments[1].constructor === Array){
                    var func;
                    for(index=0; index<arguments[1].length; index++ ){
                        if(typeof(func=this['is' + arguments[1][index].toUpperCase() + 'Phone'])==='function'){
                            if(func(phone)){
                                return true;
                            }
                        } else {
                            throw "Invalid Country Code!";
                        }
                    }
                } else if(typeof(this['is' + arguments[1].toUpperCase() + 'Phone'])==='function'){
                    return this['is' + arguments[1].toUpperCase() + 'Phone'](phone);
                } else {
                    throw "Invalid Country Code!";
                }
            } else {
                for(index=0; index<this._countryCodes.length; index++){
                    if(this['is' + this._countryCodes[index] + 'Phone'](phone)){
                        return true;
                    }
                }
            }
            return false;
        },

        /**
         * Validates if a zip code is valid in Portugal
         *
         * @method codPostal
         * @param {Number|String} cp1
         * @param {optional Number|String} cp2
         * @param {optional Boolean} returnBothResults
         * @return {Boolean} True if it's a valid zip code
         * @public
         * @static
         * @sample Ink_Util_Validator_codPostal.html 
         */
        codPostal: function(cp1,cp2,returnBothResults){


            var cPostalSep = /^(\s*\-\s*|\s+)$/;
            var trim = /^\s+|\s+$/g;
            var cPostal4 = /^[1-9]\d{3}$/;
            var cPostal3 = /^\d{3}$/;
            var parserCPostal = /^(.{4})(.*)(.{3})$/;


            returnBothResults = !!returnBothResults;

            cp1 = cp1.replace(trim,'');
            if(typeof(cp2)!=='undefined'){
                cp2 = cp2.replace(trim,'');
                if(cPostal4.test(cp1) && cPostal3.test(cp2)){
                    if( returnBothResults === true ){
                        return [true, true];
                    } else {
                        return true;
                    }
                }
            } else {
                if(cPostal4.test(cp1) ){
                    if( returnBothResults === true ){
                        return [true,false];
                    } else {
                        return true;
                    }
                }

                var cPostal = cp1.match(parserCPostal);

                if(cPostal!==null && cPostal4.test(cPostal[1]) && cPostalSep.test(cPostal[2]) && cPostal3.test(cPostal[3])){
                    if( returnBothResults === true ){
                        return [true,false];
                    } else {
                        return true;
                    }
                }
            }

            if( returnBothResults === true ){
                return [false,false];
            } else {
                return false;
            }
        },

        /**
         * Checks if a date is valid in a given format
         *
         * @method isDate
         * @param {String} format Format defined in _dateParsers
         * @param {String} dateStr Date string
         * @return {Boolean} True if it's a valid date and in the specified format
         * @public
         * @static
         * @sample Ink_Util_Validator_isDate.html 
         */
        isDate: function(format, dateStr){



            if(typeof(this._dateParsers[format])==='undefined'){
                return false;
            }
            var yearIndex = this._dateParsers[format].year;
            var monthIndex = this._dateParsers[format].month;
            var dayIndex = this._dateParsers[format].day;
            var dateParser = this._dateParsers[format].parser;
            var separator = this._dateParsers[format].sep;

            /* Trim Deactivated
            * var trim = /^\w+|\w+$/g;
            * dateStr = dateStr.replace(trim,"");
            */
            var data = dateStr.match(dateParser);
            if(data!==null){
                /* Trim Deactivated
                * for(i=1;i<=data.length;i++){
                *   data[i] = data[i].replace(trim,"");
                *}
                */
                if(data[2]===data[4] && data[2]===separator){

                    var _y = ((data[yearIndex].length===2) ? "20" + data[yearIndex].toString() : data[yearIndex] );

                    if(this._isValidDate(_y,data[monthIndex].toString(),data[dayIndex].toString())){
                        return true;
                    }
                }
            }


            return false;
        },

        /**
         * Checks if a string is a valid color
         *
         * @method isColor
         * @param {String} str Color string to be checked
         * @return {Boolean} True if it's a valid color string
         * @public
         * @static
         * @sample Ink_Util_Validator_isColor.html 
         */
        isColor: function(str){
            var match, valid = false,
                keyword = /^[a-zA-Z]+$/,
                hexa = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
                rgb = /^rgb\(\s*([0-9]{1,3})(%)?\s*,\s*([0-9]{1,3})(%)?\s*,\s*([0-9]{1,3})(%)?\s*\)$/,
                rgba = /^rgba\(\s*([0-9]{1,3})(%)?\s*,\s*([0-9]{1,3})(%)?\s*,\s*([0-9]{1,3})(%)?\s*,\s*(1(\.0)?|0(\.[0-9])?)\s*\)$/,
                hsl = /^hsl\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})(%)?\s*,\s*([0-9]{1,3})(%)?\s*\)$/,
                hsla = /^hsla\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})(%)?\s*,\s*([0-9]{1,3})(%)?\s*,\s*(1(\.0)?|0(\.[0-9])?)\s*\)$/;

            // rgb(123, 123, 132) 0 to 255
            // rgb(123%, 123%, 123%) 0 to 100
            // rgba( 4 vals) last val: 0 to 1.0
            // hsl(0 to 360, %, %)
            // hsla( ..., 0 to 1.0)

            if(
                keyword.test(str) ||
                hexa.test(str)
            ){
                return true;
            }

            var i;

            // rgb range check
            if((match = rgb.exec(str)) !== null || (match = rgba.exec(str)) !== null){
                i = match.length;

                while(i--){
                    // check percentage values
                    if((i===2 || i===4 || i===6) && typeof match[i] !== "undefined" && match[i] !== ""){
                        if(typeof match[i-1] !== "undefined" && match[i-1] >= 0 && match[i-1] <= 100){
                            valid = true;
                        } else {
                            return false;
                        }
                    }
                    // check 0 to 255 values
                    if(i===1 || i===3 || i===5 && (typeof match[i+1] === "undefined" || match[i+1] === "")){
                        if(typeof match[i] !== "undefined" && match[i] >= 0 && match[i] <= 255){
                            valid = true;
                        } else {
                            return false;
                        }
                    }
                }
            }

            // hsl range check
            if((match = hsl.exec(str)) !== null || (match = hsla.exec(str)) !== null){
                i = match.length;
                while(i--){
                    // check percentage values
                    if(i===3 || i===5){
                        if(typeof match[i-1] !== "undefined" && typeof match[i] !== "undefined" && match[i] !== "" &&
                        match[i-1] >= 0 && match[i-1] <= 100){
                            valid = true;
                        } else {
                            return false;
                        }
                    }
                    // check 0 to 360 value
                    if(i===1){
                        if(typeof match[i] !== "undefined" && match[i] >= 0 && match[i] <= 360){
                            valid = true;
                        } else {
                            return false;
                        }
                    }
                }
            }

            return valid;
        },

        /**
         * Checks if the value is a valid IP. 
         *
         * @method isIP
         * @param  {String} value   Value to be checked
         * @param  {String} ipType Type of IP to be validated. The values are: ipv4, ipv6. By default is ipv4.
         * @return {Boolean}         True if the value is a valid IP address. False if not.
         * @sample Ink_Util_Validator_isIP.html 
         */
        isIP: function( value, ipType ){
            if( typeof value !== 'string' ){
                return false;
            }

            ipType = (ipType || 'ipv4').toLowerCase();

            switch( ipType ){
                case 'ipv4':
                    return (/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/).test(value);
                case 'ipv6':
                    return (/^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$/).test(value);
                default:
                    return false;
            }
        },

        /**
         * Credit Card specifications, to be used in the credit card verification.
         *
         * @property _creditCardSpecs
         * @type {Object}
         * @private
         */
        _creditCardSpecs: {
            'default': {
                'length': '13,14,15,16,17,18,19',
                'prefix': /^.+/,
                'luhn': true
            },

            'american express': {
                'length': '15',
                'prefix': /^3[47]/,
                'luhn'  : true
            },

            'diners club': {
                'length': '14,16',
                'prefix': /^36|55|30[0-5]/,
                'luhn'  : true
            },

            'discover': {
                'length': '16',
                'prefix': /^6(?:5|011)/,
                'luhn'  : true
            },

            'jcb': {
                'length': '15,16',
                'prefix': /^3|1800|2131/,
                'luhn'  : true
            },

            'maestro': {
                'length': '16,18',
                'prefix': /^50(?:20|38)|6(?:304|759)/,
                'luhn'  : true
            },

            'mastercard': {
                'length': '16',
                'prefix': /^5[1-5]/,
                'luhn'  : true
            },

            'visa': {
                'length': '13,16',
                'prefix': /^4/,
                'luhn'  : true
            }
        },

        /**
         * Luhn function, to be used when validating credit cards
         *
         */
        _luhn: function (num){

            num = parseInt(num,10);

            if ( (typeof num !== 'number') && (num % 1 !== 0) ){
                // Luhn can only be used on nums!
                return false;
            }

            num = num+'';
            // Check num length
            var length = num.length;

            // Checksum of the card num
            var
                i, checksum = 0
            ;

            for (i = length - 1; i >= 0; i -= 2)
            {
                // Add up every 2nd digit, starting from the right
                checksum += parseInt(num.substr(i, 1),10);
            }

            for (i = length - 2; i >= 0; i -= 2)
            {
                // Add up every 2nd digit doubled, starting from the right
                var dbl = parseInt(num.substr(i, 1) * 2,10);

                // Subtract 9 from the dbl where value is greater than 10
                checksum += (dbl >= 10) ? (dbl - 9) : dbl;
            }

            // If the checksum is a multiple of 10, the number is valid
            return (checksum % 10 === 0);
        },

        /**
         * Checks if a number is of a specific credit card type
         * @method isCreditCard
         * @param  {String}  num            Number to be validates
         * @param  {String|Array}  creditCardType Credit card type. See _creditCardSpecs for the list of supported values.
         * @return {Boolean}
         * @sample Ink_Util_Validator_isCreditCard.html 
         */
        isCreditCard: function(num, creditCardType){

            if ( /\d+/.test(num) === false ){
                return false;
            }

            if ( typeof creditCardType === 'undefined' ){
                creditCardType = 'default';
            }
            else if ( creditCardType instanceof Array ){
                var i, ccLength = creditCardType.length;
                for ( i=0; i < ccLength; i++ ){
                    // Test each type for validity
                    if (this.isCreditCard(num, creditCardType[i]) ){
                        return true;
                    }
                }

                return false;
            }

            // Check card type
            creditCardType = creditCardType.toLowerCase();

            if ( typeof this._creditCardSpecs[creditCardType] === 'undefined' ){
                return false;
            }

            // Check card number length
            var length = num.length+'';

            // Validate the card length by the card type
            if ( this._creditCardSpecs[creditCardType]['length'].split(",").indexOf(length) === -1 ){
                return false;
            }

            // Check card number prefix
            if ( !this._creditCardSpecs[creditCardType]['prefix'].test(num) ){
                return false;
            }

            // No Luhn check required
            if (this._creditCardSpecs[creditCardType]['luhn'] === false){
                return true;
            }

            return this._luhn(num);
        }
    };

    return Validator;

});

/**
 * Animate.css Utility
 *
 * This module is a wrapper around animate.css's CSS classes to produce animation.
 * It contains options to ease common tasks, like listen to the "animationend" event with all necessary prefixes, remove the necessary class names when the animation finishes, or configure the duration of your animation with the necessary browser prefix.
 *
 * @module Ink.UI.Animate_1
 * @version 1
 */

Ink.createModule('Ink.UI.Animate', 1, ['Ink.UI.Common_1', 'Ink.Dom.Event_1', 'Ink.Dom.Css_1'], function (Common, InkEvent, Css) {
    'use strict';

    var animationPrefix = (function (el) {
        return ('animationName' in el.style) ? 'animation' :
               ('oAnimationName' in el.style) ? 'oAnimation' :
               ('msAnimationName' in el.style) ? 'msAnimation' :
               ('webkitAnimationName' in el.style) ? 'webkitAnimation' : null;
    }(document.createElement('div')));

    var animationEndEventName = {
        animation: 'animationend',
        oAnimation: 'oanimationend',
        msAnimation: 'MSAnimationEnd',
        webkitAnimation: 'webkitAnimationEnd'
    }[animationPrefix];

    /**
     * @class Ink.UI.Animate_1
     * @constructor
     *
     * @param {DOMElement}      element                     Animated element
     * @param {Object}          options                     Options object
     * @param {String}          options.animation           Animation name
     * @param {String|Number}   [options.duration]          Duration name (fast|medium|slow) or duration in milliseconds. Defaults to 'medium'.
     * @param {Boolean}         [options.removeClass]       Flag to remove the CSS class when finished animating. Defaults to false.
     * @param {Function}        [options.onEnd]             Callback for the animation end
     *
     * @sample Ink_UI_Animate_1.html
     *
     **/
    function Animate(elOrSelector, options) {
        this._element = Common.elOrSelector(elOrSelector);
        this._options = Common.options({
            trigger: ['Element', null],
            duration: ['String', 'slow'],  // Actually a string with a duration name, or a number of ms
            animation: ['String'],
            removeClass: ['Boolean', true],
            onEnd: ['Function', function () {}]
        }, options || {}, this._element);

        if (!isNaN(parseInt(this._options.duration, 10))) {
            this._options.duration = parseInt(this._options.duration, 10);
        }

        if (this._options.trigger) {
            InkEvent.observe(this._options.trigger, 'click', Ink.bind(function () {
                this.animate();
            }, this));  // later
        } else {
            this.animate();
        }
        Common.registerInstance(this, this._element);
    }

    Animate.prototype.animate = function () {
        Animate.animate(this._element, this._options.animation, this._options);
    };

    Ink.extendObj(Animate, {
        /**
         * Browser prefix for the CSS animations.
         *
         * @property _animationPrefix
         * @private
         **/
        _animationPrefix: animationPrefix,

        /**
         * Boolean which says whether this browser has CSS3 animation support.
         *
         * @property animationSupported
         **/
        animationSupported: !!animationPrefix,

        /**
         * Prefixed 'animationend' event name.
         *
         * @property animationEndEventName
         **/
        animationEndEventName: animationEndEventName,

        /**
         * Animate an element using one of the animate.css classes
         *
         * **Note: This is a utility method inside the `Animate` class, which you can access through `Animate.animate()`. Do not mix these up.**
         *
         * @static
         * @method animate
         * @param element {DOMElement} animated element
         * @param animation {String} animation name
         * @param [options] {Object}
         *     @param [options.onEnd=null] {Function} callback for animation end
         *     @param [options.removeClass=false] {Boolean} whether to remove the Css class when finished
         *     @param [options.duration=medium] {String|Number} duration name (fast|medium|slow) or duration in ms
         *
         * @sample Ink_UI_Animate_1_animate.html
         **/
        animate: function (element, animation, options) {
            element = Common.elOrSelector(element);

            if (typeof options === 'number' || typeof options === 'string') {
                options = { duration: options };
            }

            if (typeof arguments[3] === 'function') {
                options.onEnd = arguments[3];
            }

            if (typeof options.duration !== 'number' && typeof options.duration !== 'string') {
                options.duration = 400;
            }

            if (!Animate.animationSupported) {
                if (options.onEnd) {
                    setTimeout(function () {
                        options.onEnd(null);
                    }, 0);
                }
                return;
            }

            if (typeof options.duration === 'number') {
                element.style[animationPrefix + 'Duration'] = options.duration + 'ms';
            } else if (typeof options.duration === 'string') {
                Css.addClassName(element, options.duration);
            }

            Css.addClassName(element, ['animated', animation]);

            function onAnimationEnd(event) {
                if (event.target !== element) { return; }
                if (event.animationName !== animation) { return; }
                if (options.onEnd) { options.onEnd(event); }
                if (options.removeClass) {
                    Css.removeClassName(element, animation);
                }
                if (typeof options.duration === 'string') {
                    Css.removeClassName(element, options.duration);
                }
                element.removeEventListener(animationEndEventName, onAnimationEnd, false);
            }

            element.addEventListener(animationEndEventName, onAnimationEnd, false);
        }
    });

    return Animate;
});

/**
 * Flexible Carousel
 * @module Ink.UI.Carousel_1
 * @version 1
 */

Ink.createModule('Ink.UI.Carousel', '1',
    ['Ink.UI.Common_1', 'Ink.Dom.Event_1', 'Ink.Dom.Css_1', 'Ink.Dom.Element_1', 'Ink.UI.Pagination_1', 'Ink.Dom.Browser_1', 'Ink.Dom.Selector_1'],
    function(Common, InkEvent, Css, InkElement, Pagination, Browser/*, Selector*/) {
    'use strict';

    /*
     * TODO:
     *  keyboardSupport
     */

    function limitRange(n, min, max) {
        return Math.min(max, Math.max(min, n));
    }

    var requestAnimationFrame = window.requestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        function (cb) {return setTimeout(cb, 1000 / 30); };

    /**
     * @class Ink.UI.Carousel_1
     * @constructor
     *
     * @param {String|DOMElement}   selector                    DOM element or element id
     * @param {Object}              [options]                   Carousel Options
     * @param {Integer}             [options.autoAdvance]       Milliseconds to wait before auto-advancing pages. Set to 0 to disable auto-advance. Defaults to 0.
     * @param {String}              [options.axis]              Axis of the carousel. Set to 'y' for a vertical carousel. Defaults to 'x'.
     * @param {Boolean}             [options.center]            Flag to center the carousel horizontally.
     * @param {Number}              [options.initialPage]       Initial index page of the carousel. Defaults to 0.
     * @param {Boolean}             [options.spaceAfterLastSlide=true] If there are not enough slides to fill the full width of the last page, leave white space. Defaults to `true`.
     * @param {Boolean}             [options.swipe]             Enable swipe support if available. Defaults to true.
     * @param {Mixed}               [options.pagination]        Either an ul element to add pagination markup to or an `Ink.UI.Pagination` instance to use.
     * @param {Function}            [options.onChange]          Callback to be called when the page changes.
     *
     * @sample Ink_UI_Carousel_1.html
     */
    var Carousel = function(selector, options) {
        this._handlers = {
            paginationChange: Ink.bindMethod(this, '_onPaginationChange'),
            windowResize:     InkEvent.throttle(Ink.bindMethod(this, 'refit'), 200)
        };

        InkEvent.observe(window, 'resize', this._handlers.windowResize);

        var element = this._element = Common.elOrSelector(selector, '1st argument');

        var opts = this._options = Common.options({
            autoAdvance:    ['Integer', 0],
            axis:           ['String', 'x'],
            initialPage:    ['Integer', 0],
            spaceAfterLastSlide: ['Boolean', true],
            hideLast:       ['Boolean', false],
            center:         ['Boolean', false],
            keyboardSupport:['Boolean', false],
            pagination:     ['String', null],
            onChange:       ['Function', null],
            onInit:         ['Function', function () {}],
            swipe:          ['Boolean', true]
            // TODO exponential swipe
            // TODO specify break point for next page when moving finger
        }, options || {}, element, this);

        this._isY = (opts.axis === 'y');

        var ulEl = Ink.s('ul.stage', element);
        this._ulEl = ulEl;

        InkElement.removeTextNodeChildren(ulEl);

        if (this._options.pagination == null) {
            this._currentPage = this._options.initialPage;
        }

        this.refit(); // recalculate this._numPages

        if (this._isY) {
            // Override white-space: no-wrap which is only necessary to make sure horizontal stuff stays horizontal, but breaks stuff intended to be vertical.
            this._ulEl.style.whiteSpace = 'normal';
        }

        if (opts.swipe) {
            InkEvent.observe(element, 'touchstart', Ink.bindMethod(this, '_onTouchStart'));
            InkEvent.observe(element, 'touchmove', Ink.bindMethod(this, '_onTouchMove'));
            InkEvent.observe(element, 'touchend', Ink.bindMethod(this, '_onTouchEnd'));
        }

        this._setUpPagination();
        this._setUpAutoAdvance();
        this._setUpHider();

        this._options.onInit.call(this, this);

        Common.registerInstance(this, this._element);
    };

    Carousel.prototype = {
        /**
         * Repositions elements around.
         * Measure the carousel once again, adjusting the involved elements' sizes. This is called automatically when the window resizes, in order to cater for changes from responsive media queries, for instance.
         *
         * @method refit
         * @public
         */
        refit: function() {
            var _isY = this._isY;

            var size = function (elm, perpendicular) {
                if (!perpendicular) {
                    return InkElement.outerDimensions(elm)[_isY ? 1 : 0];
                } else {
                    return InkElement.outerDimensions(elm)[_isY ? 0 : 1];
                }
            };

            this._liEls = Ink.ss('li.slide', this._ulEl);
            var numSlides = this._liEls.length;

            var contRect = this._ulEl.getBoundingClientRect();
            this._ctnLength = _isY ? contRect.bottom - contRect.top : contRect.right - contRect.left;
            this._elLength = size(this._liEls[0]);
            this._slidesPerPage = Math.floor( this._ctnLength / this._elLength  ) || 1;

            var numPages = Math.ceil( numSlides / this._slidesPerPage );
            var numPagesChanged = this._numPages !== numPages;
            this._numPages = numPages;
            this._deltaLength = this._slidesPerPage * this._elLength;
            
            this._center();
            this._updateHider();
            this._IE7();

            if (this._pagination && numPagesChanged) {
                this._pagination.setSize(this._numPages);
            }
            this.setPage(limitRange(this.getPage(), 0, this._numPages));
        },

        _setUpPagination: function () {
            if (this._options.pagination) {
                if (Common.isDOMElement(this._options.pagination) ||
                        typeof this._options.pagination === 'string') {
                    // if dom element or css selector string...
                    this._pagination = new Pagination(this._options.pagination, {
                        size:     this._numPages,
                        onChange: this._handlers.paginationChange
                    });
                } else {
                    // assumes instantiated pagination
                    this._pagination = this._options.pagination;
                    this._pagination._options.onChange = this._handlers.paginationChange;
                    this._pagination.setSize(this._numPages);
                }
                this._pagination.setCurrent(this._options.initialPage || 0);
            } else {
                this._currentPage = this._options.initialPage || 0;
            }
        },

        _setUpAutoAdvance: function () {
            if (!this._options.autoAdvance) { return; }
            var self = this;

            setTimeout(function autoAdvance() {
                self.nextPage(true /* wrap */);
                setTimeout(autoAdvance, self._options.autoAdvance);
            }, this._options.autoAdvance);
        },

        _setUpHider: function () {
            if (this._options.hideLast) {
                var hiderEl = InkElement.create('div', {
                    className: 'hider',
                    insertBottom: this._element
                });
                hiderEl.style.position = 'absolute';
                hiderEl.style[ this._isY ? 'left' : 'top' ] = '0';  // fix to top..
                hiderEl.style[ this._isY ? 'right' : 'bottom' ] = '0';  // and bottom...
                hiderEl.style[ this._isY ? 'bottom' : 'right' ] = '0';  // and move to the end.
                this._hiderEl = hiderEl;
            }
        },

        _center: function() {
            if (!this._options.center) { return; }
            var gap = Math.floor( (this._ctnLength - (this._elLength * this._slidesPerPage) ) / 2 );

            var pad;
            if (this._isY) {
                pad = [gap, 'px 0'];
            } else {
                pad = ['0 ', gap, 'px'];
            }

            this._ulEl.style.padding = pad.join('');
        },

        _updateHider: function() {
            if (!this._hiderEl) { return; }
            if (this.getPage() === 0) {
                var gap = Math.floor( this._ctnLength - (this._elLength * this._slidesPerPage) );
                if (this._options.center) {
                    gap /= 2;
                }
                this._hiderEl.style[ this._isY ? 'height' : 'width' ] = gap + 'px';
            } else {
                this._hiderEl.style[ this._isY ? 'height' : 'width' ] = '0px';
            }
        },
        
        /**
         * Refits elements for IE7 because it doesn't support inline-block.
         *
         * @method _IE7
         * @private
         */
        _IE7: function () {
            if (Browser.IE && '' + Browser.version.split('.')[0] === '7') {
                // var numPages = this._numPages;
                var slides = Ink.ss('li.slide', this._ulEl);
                var stl = function (prop, val) {slides[i].style[prop] = val; };
                for (var i = 0, len = slides.length; i < len; i++) {
                    stl('position', 'absolute');
                    stl(this._isY ? 'top' : 'left', (i * this._elLength) + 'px');
                }
            }
        },

        _onTouchStart: function (event) {
            if (event.touches.length > 1) { return; }

            this._swipeData = {
                x: InkEvent.pointerX(event),
                y: InkEvent.pointerY(event),
                lastUlPos: null
            };

            var ulRect = this._ulEl.getBoundingClientRect();

            this._swipeData.inUlX =  this._swipeData.x - ulRect.left;
            this._swipeData.inUlY =  this._swipeData.y - ulRect.top;

            setTransitionProperty(this._ulEl, 'none');

            this._touchMoveIsFirstTouchMove = true;

            // InkEvent.stopDefault(event);
            InkEvent.stopPropagation(event);
        },

        _onTouchMove: function (event) {
            if (event.touches.length > 1) { return; /* multitouch event, not my problem. */ }

            var pointerX = InkEvent.pointerX(event);
            var pointerY = InkEvent.pointerY(event);

            var deltaY = Math.abs(pointerY - this._swipeData.y);
            var deltaX = Math.abs(pointerX - this._swipeData.x);

            if (this._touchMoveIsFirstTouchMove) {
                this._touchMoveIsFirstTouchMove = undefined;
                this._scrolling = this._isY ?
                    deltaX > deltaY :
                    deltaY > deltaX ;

                if (!this._scrolling) {
                    this._onAnimationFrame();
                }
            }

            if (!this._scrolling && this._swipeData) {
                InkEvent.stopDefault(event);

                this._swipeData.pointerPos = this._isY ? pointerY : pointerX;
            }

            InkEvent.stopPropagation(event);
        },

        _onAnimationFrame: function () {
            var swipeData = this._swipeData;

            if (!swipeData || this._scrolling || this._touchMoveIsFirstTouchMove) { return; }

            var elRect = this._element.getBoundingClientRect();

            var newPos;

            if (!this._isY) {
                newPos = swipeData.pointerPos - swipeData.inUlX - elRect.left;
            } else {
                newPos = swipeData.pointerPos - swipeData.inUlY - elRect.top;
            }

            this._ulEl.style[this._isY ? 'top' : 'left'] = newPos + 'px';

            swipeData.lastUlPos = newPos;

            requestAnimationFrame(Ink.bindMethod(this, '_onAnimationFrame'));
        },

        _onTouchEnd: function (event) {
            if (this._swipeData && this._swipeData.pointerPos && !this._scrolling && !this._touchMoveIsFirstTouchMove) {
                var snapToNext = 0.1;  // swipe 10% of the way to change page
                var progress = - this._swipeData.lastUlPos;

                var curPage = this.getPage();
                var estimatedPage = progress / this._elLength / this._slidesPerPage;

                if (Math.round(estimatedPage) === curPage) {
                    var diff = estimatedPage - curPage;
                    if (Math.abs(diff) > snapToNext) {
                        diff = diff > 0 ? 1 : -1;
                        curPage += diff;
                    }
                } else {
                    curPage = Math.round(estimatedPage);
                }

                this.setPage(curPage);

                InkEvent.stopPropagation(event);
                InkEvent.stopDefault(event);
            }

            setTransitionProperty(this._ulEl, null /* transition: left, top */);
            this._swipeData = null;
            this._touchMoveIsFirstTouchMove = undefined;
            this._scrolling = undefined;
        },

        _onPaginationChange: function(pgn) {
            this._setPage(pgn.getCurrent());
        },

        /**
         * Gets the current page index
         * @method getPage
         * @return The current page number
         **/
        getPage: function () {
            if (this._pagination) {
                return this._pagination.getCurrent();
            } else {
                return this._currentPage || 0;
            }
        },

        /**
         * Sets the current page index
         * @method setPage
         * @param {Number}  page    Index of the destination page.
         * @param {Boolean} [wrap]  Flag to activate circular counting.
         **/
        setPage: function (page, wrap) {
            if (wrap) {
                // Pages outside the range [0..this._numPages] are wrapped.
                page = page % this._numPages;
                if (page < 0) { page = this._numPages - page; }
            }
            page = limitRange(page, 0, this._numPages - 1);

            if (this._pagination) {
                this._pagination.setCurrent(page);
            } else {
                this._setPage(page);
            }
        },

        _setPage: function (page) {
            var _lengthToGo = page * this._deltaLength;
            var isLastPage = page === (this._numPages - 1);

            if (!this._options.spaceAfterLastSlide && isLastPage && page > 0) { 
                var _itemsInLastPage = this._liEls.length - (page * this._slidesPerPage);
                if(_itemsInLastPage < this._slidesPerPage) {
                    _lengthToGo = ((page - 1) * this._deltaLength) + (_itemsInLastPage * this._elLength);
                }
            }

            this._ulEl.style[ this._isY ? 'top' : 'left'] =
                ['-', _lengthToGo, 'px'].join('');

            if (this._options.onChange) {
                this._options.onChange.call(this, page);
            }

            this._currentPage = page;

            this._updateHider();
        },

        /**
         * Goes to the next page
         * @method nextPage
         * @param {Boolean} [wrap] Flag to loop from last page to first page.
         **/
        nextPage: function (wrap) {
            this.setPage(this.getPage() + 1, wrap);
        },

        /**
         * Goes to the previous page
         * @method previousPage
         * @param {Boolean} [wrap] Flag to loop from first page to last page.
         **/
        previousPage: function (wrap) { this.setPage(this.getPage() - 1, wrap); },

        /**
         * Returns how many slides fit into a page
         * @method getSlidesPerPage
         * @return {Number} The number of slides per page
         * @public
         */
        getSlidesPerPage: function() {
            return this._slidesPerPage;
        },

        /**
         * Get the amount of pages in the carousel.
         * @method getTotalPages
         * @return {Number} The number of pages
         * @public
         */
        getTotalPages: function() {
            return this._numPages;
        },

        /**
         * Get the stage element (your UL with the class ".stage").
         * @method getStageElm
         * @public
         * @return {DOMElement} Stage element
         **/
        getStageElm: function() {
            return this._ulEl;
        },

        /**
         * Get a list of your slides (elements with the ".slide" class inside your stage)
         * @method getSlidesList
         * @return {DOMElement[]} Array containing the slides.
         * @public
         */
        getSlidesList: function() {
            return this._liEls;
        },

        /**
         * Get the total number of slides
         * @method getTotalSlides
         * @return {Number} The number of slides
         * @public
         */
        getTotalSlides: function() {
            return this.getSlidesList().length;
        }
    };

    function setTransitionProperty(el, newTransition) {
        el.style.transitionProperty =
        el.style.oTransitionProperty =
        el.style.msTransitionProperty =
        el.style.mozTransitionProperty =
        el.style.webkitTransitionProperty = newTransition;
    }

    return Carousel;

});

/**
 * Closing utilities
 * @module Ink.UI.Close_1
 * @version 1
 */
Ink.createModule('Ink.UI.Close', '1', ['Ink.Dom.Event_1','Ink.Dom.Element_1'], function(InkEvent, InkElement) {
    'use strict';

    /**
     * Subscribes clicks on the document.body.
     * Whenever an element with the classes ".ink-close" or ".ink-dismiss" is clicked, this module finds an ancestor ".ink-alert" or ".ink-alert-block" element and removes it from the DOM.
     * This module should be created only once per page.
     * 
     * @class Ink.UI.Close
     * @constructor
     * @example
     *     <script>
     *         Ink.requireModules(['Ink.UI.Close_1'],function( Close ){
     *             new Close();
     *         });
     *     </script>
     *
     * @sample Ink_UI_Close_1.html
     */
    var Close = function() {
        InkEvent.observe(document.body, 'click', function(ev) {
            var el = InkEvent.element(ev);

            el = InkElement.findUpwardsByClass(el, 'ink-close') ||
                 InkElement.findUpwardsByClass(el, 'ink-dismiss');

            if (!el) {
                return;  // ink-close or ink-dismiss class not found
            }

            var toRemove = InkElement.findUpwardsByClass(el, 'ink-alert') ||
                           InkElement.findUpwardsByClass(el, 'ink-alert-block') ||
                           el;

            if (toRemove) {
                InkEvent.stop(ev);
                InkElement.remove(toRemove);
            }
        });
    };

    return Close;
});

/**
 * Auxiliar utilities for UI Modules
 * @module Ink.UI.Common_1
 * @version 1
 */
 
Ink.createModule('Ink.UI.Common', '1', ['Ink.Dom.Element_1', 'Ink.Net.Ajax_1','Ink.Dom.Css_1','Ink.Dom.Selector_1','Ink.Util.Url_1'], function(InkElement, Ajax,Css,Selector,Url) {

    'use strict';

    var instances = {};
    var lastIdNum = 0;
    var nothing = {} /* a marker, for reference comparison. */;

    var keys = Object.keys || function (obj) {
        var ret = [];
        for (var k in obj) if (obj.hasOwnProperty(k)) {
            ret.push(k);
        }
        return ret;
    };

    /**
     * @namespace Ink.UI.Common_1
     */

    var Common = {

        /**
         * Supported Ink Layouts
         *
         * @property Layouts
         * @type Object
         * @readOnly
         */
        Layouts: {
            TINY: 'tiny',
            SMALL:  'small',
            MEDIUM: 'medium',
            LARGE:  'large',
            XLARGE: 'xlarge'
        },

        /**
         * Checks if an item is a valid DOM Element.
         *
         * @method isDOMElement
         * @static
         * @param   {Mixed}     o   The object to be checked.
         * @return  {Boolean}       True if it's a valid DOM Element.
         * @example
         *     var el = Ink.s('#element');
         *     if( Ink.UI.Common.isDOMElement( el ) === true ){
         *         // It is a DOM Element.
         *     } else {
         *         // It is NOT a DOM Element.
         *     }
         */
        isDOMElement: function(o) {
            return o && typeof o === 'object' && 'nodeType' in o && o.nodeType === 1;
        },

        /**
         * Checks if an item is a valid integer.
         *
         * @method isInteger
         * @static
         * @param {Mixed} n     The value to be checked.
         * @return {Boolean}    True if it's a valid integer.
         * @example
         *     var value = 1;
         *     if( Ink.UI.Common.isInteger( value ) === true ){
         *         // It is an integer.
         *     } else {
         *         // It is NOT an integer.
         *     }
         */
        isInteger: function(n) {
            return (typeof n === 'number' && n % 1 === 0);
        },

        /**
         * Gets a DOM Element. 
         *
         * @method elOrSelector
         * @static
         * @param  {DOMElement|String}      elOrSelector    DOM Element or CSS Selector
         * @param  {String}                 fieldName       The name of the field. Commonly used for debugging.
         * @return {DOMElement} Returns the DOMElement passed or the first result of the CSS Selector. Otherwise it throws an exception.
         * @example
         *     // In case there are several .myInput, it will retrieve the first found
         *     var el = Ink.UI.Common.elOrSelector('.myInput','My Input');
         */
        elOrSelector: function(elOrSelector, fieldName) {
            if (!this.isDOMElement(elOrSelector)) {
                var t = Selector.select(elOrSelector);
                if (t.length === 0) {
                    Ink.warn(fieldName + ' must either be a DOM Element or a selector expression!\nThe script element must also be after the DOM Element itself.');
                    return null;
                }
                return t[0];
            }
            return elOrSelector;
        },

        /**
         * Alias for `elOrSelector` but returns an array of elements.
         *
         * @method elsOrSelector
         *
         * @static
         * @param  {DOMElement|String}      elOrSelector    DOM Element or CSS Selector
         * @param  {String}                 fieldName       The name of the field. Commonly used for debugging.
         * @return {DOMElement} Returns the DOMElement passed or the first result of the CSS Selector. Otherwise it throws an exception.
         * @param {Boolean} required Flag to accept an empty array as output.
         * @return {Array} The selected DOM Elements.
         * @example
         *     var elements = Ink.UI.Common.elsOrSelector('input.my-inputs', 'My Input');
         */
        elsOrSelector: function(elsOrSelector, fieldName, required) {
            var ret;
            if (typeof elsOrSelector === 'string') {
                ret = Selector.select(elsOrSelector);
            } else if (Common.isDOMElement(elsOrSelector)) {
                ret = [elsOrSelector];
            } else if (elsOrSelector && typeof elsOrSelector === 'object' && typeof elsOrSelector.length === 'number') {
                ret = elsOrSelector;
            }

            if (ret && ret.length) {
                return ret;
            } else {
                if (required) {
                    throw new TypeError(fieldName + ' must either be a DOM Element, an Array of elements, or a selector expression!\nThe script element must also be after the DOM Element itself.');
                } else {
                    return [];
                }
            }
        },

        /**
         * Gets options an object and element's metadata.
         *
         * The element's data attributes take precedence. Values from the element's data-atrributes are coerced into the required type.
         *
         * @method options
         *
         * @param {Object}      [fieldId]   Name to be used in debugging features.
         * @param {Object}      defaults    Object with the options' types and defaults.
         * @param {Object}      overrides   Options to override the defaults. Usually passed when instantiating an UI module.
         * @param {DOMElement}  [element]   Element with data-attributes
         *
         * @example
         *
         *      this._options = Ink.UI.Common.options('MyComponent', {
         *          'anobject': ['Object', null],  // Defaults to null
         *          'target': ['Element', null],
         *          'stuff': ['Number', 0.1],
         *          'stuff2': ['Integer', 0],
         *          'doKickFlip': ['Boolean', false],
         *          'targets': ['Elements'], // Required option since no default was given
         *          'onClick': ['Function', null]
         *      }, options || {}, elm)
         *
         * @example
         *
         * ### Note about booleans
         *
         * Here is how options are read from the markup
         * data-attributes, for several values`data-a-boolean`.
         *
         * Options considered true:
         *
         *   - `data-a-boolean="true"`
         *   - (Every other value which is not on the list below.)
         * 
         * Options considered false:
         *
         *   - `data-a-boolean="false"`
         *   - `data-a-boolean=""`
         *   - `data-a-boolean`
         *
         * Options which go to default:
         *
         *   - (no attribute). When `data-a-boolean` is ommitted, the
         *   option is not considered true nor false, and as such
         *   defaults to what is in the `defaults` argument.
         *
         **/
        options: function (fieldId, defaults, overrides, element) {
            if (typeof fieldId !== 'string') {
                element = overrides;
                overrides = defaults;
                defaults = fieldId;
                fieldId = '';
            }
            overrides = overrides || {};
            var out = {};
            var dataAttrs = element ? InkElement.data(element) : {};
            var fromDataAttrs;
            var type;
            var lType;
            var defaultVal;

            var invalidStr = function (str) {
                if (fieldId) { str = fieldId + ': "' + ('' + str).replace(/"/, '\\"') + '"'; }
                return str;
            };

            var quote = function (str) {
                return '"' + ('' + str).replace(/"/, '\\"') + '"';
            };

            var invalidThrow = function (str) {
                throw new Error(invalidStr(str));
            };

            var invalid = function (str) {
                Ink.error(invalidStr(str) + '. Ignoring option.');
            };

            function optionValue(key) {
                type = defaults[key][0];
                lType = type.toLowerCase();
                defaultVal = defaults[key].length === 2 ? defaults[key][1] : nothing;

                if (!type) {
                    invalidThrow('Ink.UI.Common.options: Always specify a type!');
                }
                if (!(lType in Common._coerce_funcs)) {
                    invalidThrow('Ink.UI.Common.options: ' + defaults[key][0] + ' is not a valid type. Use one of ' + keys(Common._coerce_funcs).join(', '));

                }
                if (!defaults[key].length || defaults[key].length > 2) {
                    invalidThrow('the "defaults" argument must be an object mapping option names to [typestring, optional] arrays.');
                }

                if (key in dataAttrs) {
                    fromDataAttrs = Common._coerce_from_string(lType, dataAttrs[key], key, fieldId);
                    // (above can return `nothing`)
                } else {
                    fromDataAttrs = nothing;
                }

                if (fromDataAttrs !== nothing) {
                    if (!Common._options_validate(fromDataAttrs, lType)) {
                        invalid('(' + key + ' option) Invalid ' + lType + ' ' + quote(fromDataAttrs));
                        return defaultVal;
                    } else {
                        return fromDataAttrs;
                    }
                } else if (key in overrides) {
                    return overrides[key];
                } else if (defaultVal !== nothing) {
                    return defaultVal;
                } else {
                    invalidThrow('Option ' + key + ' is required!');
                }
            }

            for (var key in defaults) {
                if (defaults.hasOwnProperty(key)) {
                    out[key] = optionValue(key);
                }
            }

            return out;
        },

        _coerce_from_string: function (type, val, paramName, fieldId) {
            if (type in Common._coerce_funcs) {
                return Common._coerce_funcs[type](val, paramName, fieldId);
            } else {
                return val;
            }
        },

        _options_validate: function (val, type) {
            if (type in Common._options_validate_types) {
                return Common._options_validate_types[type].call(Common, val);
            } else {
                // 'object' options cannot be passed through data-attributes.
                // Json you say? Not any good to embed in HTML.
                return false;
            }
        },

        _coerce_funcs: (function () {
            var ret = {
                element: function (val) {
                    return Common.elOrSelector(val, '');
                },
                elements: function (val) {
                    return Common.elsOrSelector(val, '', false /*not required, so don't throw an exception now*/);
                },
                object: function (val) { return val; },
                number: function (val) { return parseFloat(val); },
                'boolean': function (val) {
                    return !(val === 'false' || val === '' || val === null);
                },
                string: function (val) { return val; },
                'function': function (val, paramName, fieldId) {
                    Ink.error(fieldId + ': You cannot specify the option "' + paramName + '" through data-attributes because it\'s a function');
                    return nothing;
                }
            };
            ret['float'] = ret.integer = ret.number;
            return ret;
        }()),

        _options_validate_types: (function () {
            var types = {
                string: function (val) {
                    return typeof val === 'string';
                },
                number: function (val) {
                    return typeof val === 'number' && !isNaN(val) && isFinite(val);
                },
                integer: function (val) {
                    return val === Math.round(val);
                },
                element: function (val) {
                    return Common.isDOMElement(val);
                },
                elements: function (val) {
                    return val && typeof val === 'object' && typeof val.length === 'number' && val.length;
                },
                'boolean': function (val) {
                    return typeof val === 'boolean';
                }
            };
            types['float'] = types.number;
            return types;
        }()),

        /**
         * Deep copy (clone) an object.
         * Note: The object cannot have referece loops.
         *
         * @method clone
         * @static
         * @param  {Object} o The object to be cloned/copied.
         * @return {Object} Returns the result of the clone/copy.
         * @example
         *     var originalObj = {
         *         key1: 'value1',
         *         key2: 'value2',
         *         key3: 'value3'
         *     };
         *     var cloneObj = Ink.UI.Common.clone( originalObj );
         */
        clone: function(o) {
            try {
                return JSON.parse( JSON.stringify(o) );
            } catch (ex) {
                throw new Error('Given object cannot have loops!');
            }
        },


        /**
         * Gets an element's one-base index relative to its parent.
         *
         * @method childIndex
         * @static
         * @param  {DOMElement}     childEl     Valid DOM Element.
         * @return {Number}                     Numerical position of an element relatively to its parent.
         * @example
         *     <!-- Imagine the following HTML: -->
         *     <ul>
         *       <li>One</li>
         *       <li>Two</li>
         *       <li id="test">Three</li>
         *       <li>Four</li>
         *     </ul>
         *
         *     <script>
         *         var testLi = Ink.s('#test');
         *         Ink.UI.Common.childIndex( testLi ); // Returned value: 3
         *     </script>
         */
        childIndex: function(childEl) {
            if( Common.isDOMElement(childEl) ){
                var els = Selector.select('> *', childEl.parentNode);
                for (var i = 0, f = els.length; i < f; ++i) {
                    if (els[i] === childEl) {
                        return i;
                    }
                }
            }
            throw 'not found!';
        },


        /**
         * AJAX JSON request shortcut method
         * It provides a more convenient way to do an AJAX request and expect a JSON response.It also offers a callback option, as third parameter, for better async handling.
         *
         * @method ajaxJSON
         * @static
         * @async
         * @param   {String}    endpoint    Valid URL to be used as target by the request.
         * @param   {Object}    params      This field is used in the thrown Exception to identify the parameter.
         * @param   {Function}  cb          Callback for the request.
         * @example
         *     // In case there are several .myInput, it will retrieve the first found
         *     var el = Ink.UI.Common.elOrSelector('.myInput','My Input');
         */
        ajaxJSON: function(endpoint, params, cb) {
            new Ajax(
                endpoint,
                {
                    evalJS:         'force',
                    method:         'POST',
                    parameters:     params,

                    onSuccess:  function( r) {
                        try {
                            r = r.responseJSON;
                            if (r.status !== 'ok') {
                                throw 'server error: ' + r.message;
                            }
                            cb(null, r);
                        } catch (ex) {
                            cb(ex);
                        }
                    },

                    onFailure: function() {
                        cb('communication failure');
                    }
                }
            );
        },


        /**
         * Gets the current Ink layout.
         *
         * @method currentLayout
         * @static
         * @return {String}         A string representation of the current layout name.
         * @example
         *      var inkLayout = Ink.UI.Common.currentLayout();
         *      if (inkLayout === 'small') {
         *          // ...
         *      }
         */
        currentLayout: function() {
            var i, f, k, v, el, detectorEl = Selector.select('#ink-layout-detector')[0];
            if (!detectorEl) {
                detectorEl = document.createElement('div');
                detectorEl.id = 'ink-layout-detector';
                for (k in this.Layouts) {
                    if (this.Layouts.hasOwnProperty(k)) {
                        v = this.Layouts[k];
                        el = document.createElement('div');
                        el.className = 'show-' + v + ' hide-all';
                        el.setAttribute('data-ink-layout', v);
                        detectorEl.appendChild(el);
                    }
                }
                document.body.appendChild(detectorEl);
            }

            var result = '';
            var resultCount = 0;
            for (i = 0, f = detectorEl.childNodes.length; i < f; ++i) {
                el = detectorEl.childNodes[i];
                if (Css.getStyle(el, 'display') === 'block') {
                    result = el.getAttribute('data-ink-layout');
                    resultCount += 1;
                }
            }

            if (resultCount === 1) {
                return result;
            } else {
                return 'large';
            }
        },


        /**
         * Sets the location's hash (window.location.hash).
         *
         * @method hashSet
         * @static
         * @param  {Object} o   Object with the info to be placed in the location's hash.
         * @example
         *     // It will set the location's hash like: <url>#key1=value1&key2=value2&key3=value3
         *     Ink.UI.Common.hashSet({
         *         key1: 'value1',
         *         key2: 'value2',
         *         key3: 'value3'
         *     });
         */
        hashSet: function(o) {
            if (typeof o !== 'object') { throw new TypeError('o should be an object!'); }
            var hashParams = Url.getAnchorString();
            hashParams = Ink.extendObj(hashParams, o);
            window.location.hash = Url.genQueryString('', hashParams).substring(1);
        },

        /**
         * Removes children nodes from a given object.
         * This method was initially created to help solve a problem in Internet Explorer(s) that occurred when trying to set the innerHTML of some specific elements like 'table'.
         *
         * @method cleanChildren
         * @static
         * @param  {DOMElement} parentEl Valid DOM Element
         * @example
         *     <!-- Imagine the following HTML: -->
         *     <ul id="myUl">
         *       <li>One</li>
         *       <li>Two</li>
         *       <li>Three</li>
         *       <li>Four</li>
         *     </ul>
         *
         *     <script>
         *     Ink.UI.Common.cleanChildren( Ink.s( '#myUl' ) );
         *     </script>
         *
         *     <!-- After running it, the HTML changes to: -->
         *     <ul id="myUl"></ul>
         */
        cleanChildren: function(parentEl) {
            if( !Common.isDOMElement(parentEl) ){
                throw 'Please provide a valid DOMElement';
            }
            var prevEl, el = parentEl.lastChild;
            while (el) {
                prevEl = el.previousSibling;
                parentEl.removeChild(el);
                el = prevEl;
            }
        },

        /**
         * Stores the id and/or classes of an element in an object.
         *
         * @method storeIdAndClasses
         * @static
         * @param  {DOMElement} fromEl    Valid DOM Element to get the id and classes from.
         * @param  {Object}     inObj     Object where the id and classes will be saved.
         * @example
         *     <div id="myDiv" class="aClass"></div>
         *
         *     <script>
         *         var storageObj = {};
         *         Ink.UI.Common.storeIdAndClasses( Ink.s('#myDiv'), storageObj );
         *         // storageObj changes to:
         *         {
         *           _id: 'myDiv',
         *           _classes: 'aClass'
         *         }
         *     </script>
         */
        storeIdAndClasses: function(fromEl, inObj) {
            if( !Common.isDOMElement(fromEl) ){
                throw 'Please provide a valid DOMElement as first parameter';
            }

            var id = fromEl.id;
            if (id) {
                inObj._id = id;
            }

            var classes = fromEl.className;
            if (classes) {
                inObj._classes = classes;
            }
        },

        /**
         * Sets the id and className properties of an element based 
         *
         * @method restoreIdAndClasses
         * @static
         * @param  {DOMElement} toEl    Valid DOM Element to set the id and classes on.
         * @param  {Object}     inObj   Object where the id and classes to be set are. This method uses the same format as the one given in `storeIdAndClasses`
         * @example
         *     <div></div>
         *
         *     <script>
         *         var storageObj = {
         *           _id: 'myDiv',
         *           _classes: 'aClass'
         *         };
         *
         *         Ink.UI.Common.storeIdAndClasses( Ink.s('div'), storageObj );
         *     </script>
         *
         *     <!-- After the code runs the div element changes to: -->
         *     <div id="myDiv" class="aClass"></div>
         */
        restoreIdAndClasses: function(toEl, inObj) {

            if( !Common.isDOMElement(toEl) ){
                throw 'Please provide a valid DOMElement as first parameter';
            }

            if (inObj._id && toEl.id !== inObj._id) {
                toEl.id = inObj._id;
            }

            if (inObj._classes && toEl.className.indexOf(inObj._classes) === -1) {
                if (toEl.className) { toEl.className += ' ' + inObj._classes; }
                else {                toEl.className  =       inObj._classes; }
            }

            if (inObj._instanceId && !toEl.getAttribute('data-instance')) {
                toEl.setAttribute('data-instance', inObj._instanceId);
            }
        },

        /**
         * Saves a component's instance reference for later retrieval.
         *
         * @method registerInstance
         * @static
         * @param  {Object}     inst                Object that holds the instance.
         * @param  {DOMElement} el                  DOM Element to associate with the object.
         * @param  {Object}     [optionalPrefix]    Defaults to 'instance'
         */
        registerInstance: function(inst, el, optionalPrefix) {
            if (inst._instanceId) { return; }

            if (typeof inst !== 'object') { throw new TypeError('1st argument must be a JavaScript object!'); }

            if (inst._options && inst._options.skipRegister) { return; }

            if (!this.isDOMElement(el)) { throw new TypeError('2nd argument must be a DOM element!'); }
            if (optionalPrefix !== undefined && typeof optionalPrefix !== 'string') { throw new TypeError('3rd argument must be a string!'); }
            var id = (optionalPrefix || 'instance') + (++lastIdNum);
            instances[id] = inst;
            inst._instanceId = id;
            var dataInst = el.getAttribute('data-instance');
            dataInst = (dataInst !== null) ? [dataInst, id].join(' ') : id;
            el.setAttribute('data-instance', dataInst);
        },

        /**
         * Deletes an instance with a given id.
         *
         * @method unregisterInstance
         * @static
         * @param  {String}     id       Id of the instance to be destroyed.
         */
        unregisterInstance: function(id) {
            delete instances[id];
        },

        /**
         * Gets an UI instance from an element or instance id.
         *
         * @method getInstance
         * @static
         * @param  {String|DOMElement}      instanceIdOrElement      Instance's id or DOM Element from which we want the instances.
         * @return  {Object|Array}       Returns an instance or a collection of instances.
         */
        getInstance: function(instanceIdOrElement) {
            var ids;
            if (this.isDOMElement(instanceIdOrElement)) {
                ids = instanceIdOrElement.getAttribute('data-instance');
                if (ids === null) { throw new Error('argument is not a DOM instance element!'); }
            }
            else {
                ids = instanceIdOrElement;
            }

            ids = ids.split(' ');
            var inst, id, i, l = ids.length;

            var res = [];
            for (i = 0; i < l; ++i) {
                id = ids[i];
                if (!id) { throw new Error('Element is not a JS instance!'); }
                inst = instances[id];
                if (!inst) { throw new Error('Instance "' + id + '" not found!'); }
                res.push(inst);
            }

            return (l === 1) ? res[0] : res;
        },

        /**
         * Gets an instance based on a selector.
         *
         * @method getInstanceFromSelector
         * @static
         * @param  {String}             selector    CSS selector to get the instances from.
         * @return  {Object|Array}               Returns an instance or a collection of instances.
         */
        getInstanceFromSelector: function(selector) {
            var el = Selector.select(selector)[0];
            if (!el) { throw new Error('Element not found!'); }
            return this.getInstance(el);
        },

        /**
         * Gets all the instance ids
         *
         * @method getInstanceIds
         * @static
         * @return  {Array}     Collection of instance ids
         */
        getInstanceIds: function() {
            var res = [];
            for (var id in instances) {
                if (instances.hasOwnProperty(id)) {
                    res.push( id );
                }
            }
            return res;
        },

        /**
         * Gets all the instances
         *
         * @method getInstances
         * @static
         * @return  {Array}     Collection of existing instances.
         */
        getInstances: function() {
            var res = [];
            for (var id in instances) {
                if (instances.hasOwnProperty(id)) {
                    res.push( instances[id] );
                }
            }
            return res;
        },

        /**
         * Boilerplate method to destroy a component.
         * Components should copy this method as its destroy method and modify it.
         *
         * @method destroyComponent
         * @static
         */
        destroyComponent: function() {
            Common.unregisterInstance(this._instanceId);
            this._element.parentNode.removeChild(this._element);
        }

    };

    return Common;

});

/**
 * Date selector
 * @module Ink.UI.DatePicker_1
 * @version 1
 */

Ink.createModule('Ink.UI.DatePicker', '1', ['Ink.UI.Common_1','Ink.Dom.Event_1','Ink.Dom.Css_1','Ink.Dom.Element_1','Ink.Dom.Selector_1','Ink.Util.Array_1','Ink.Util.Date_1', 'Ink.Dom.Browser_1'], function(Common, Event, Css, InkElement, Selector, InkArray, InkDate ) {
    'use strict';

    // Repeat a string. Long version of (new Array(n)).join(str);
    function strRepeat(n, str) {
        var ret = '';
        for (var i = 0; i < n; i++) {
            ret += str;
        }
        return ret;
    }

    // Clamp a number into a min/max limit
    function clamp(n, min, max) {
        if (n > max) { n = max; }
        if (n < min) { n = min; }

        return n;
    }

    function dateishFromYMDString(YMD) {
        var split = YMD.split('-');
        return dateishFromYMD(+split[0], +split[1] - 1, +split[2]);
    }

    function dateishFromYMD(year, month, day) {
        return {_year: year, _month: month, _day: day};
    }

    function dateishFromDate(date) {
        return {_year: date.getFullYear(), _month: date.getMonth(), _day: date.getDate()};
    }

    /**
     * @class Ink.UI.DatePicker
     * @constructor
     * @version 1
     *
     * @param {String|DOMElement}   selector
     * @param {Object}              [options]                   Options
     * @param {Boolean}             [options.autoOpen]          Flag to automatically open the datepicker.
     * @param {String}              [options.cleanText]         Text for the clean button. Defaults to 'Limpar'.
     * @param {String}              [options.closeText]         Text for the close button. Defaults to 'Fechar'.
     * @param {String}              [options.cssClass]          CSS class to be applied on the datepicker
     * @param {String}              [options.dateRange]         Enforce limits to year, month and day for the Date, ex: '1990-08-25:2020-11'
     * @param {Boolean}             [options.displayInSelect]   Flag to display the component in a select element.
     * @param {String|DOMElement}   [options.dayField]          (if using options.displayInSelect) `select` field with days.
     * @param {String|DOMElement}   [options.monthField]        (if using options.displayInSelect) `select` field with months.
     * @param {String|DOMElement}   [options.yearField]         (if using options.displayInSelect) `select` field with years.
     * @param {String}              [options.format]            Date format string
     * @param {String}              [options.instance]          Unique id for the datepicker
     * @param {Object}              [options.month]             Hash of month names. Defaults to portuguese month names. January is 1.
     * @param {String}              [options.nextLinkText]      Text for the previous button. Defaults to '«'.
     * @param {String}              [options.ofText]            Text to show between month and year. Defaults to ' of '.
     * @param {Boolean}             [options.onFocus]           If the datepicker should open when the target element is focused. Defaults to true.
     * @param {Function}            [options.onMonthSelected]   Callback to execute when the month is selected.
     * @param {Function}            [options.onSetDate]         Callback to execute when the date is set.
     * @param {Function}            [options.onYearSelected]    Callback to execute when the year is selected.
     * @param {String}              [options.position]          Position for the datepicker. Either 'right' or 'bottom'. Defaults to 'right'.
     * @param {String}              [options.prevLinkText]      Text for the previous button. Defaults to '«'.
     * @param {Boolean}             [options.showClean]         If the clean button should be visible. Defaults to true.
     * @param {Boolean}             [options.showClose]         If the close button should be visible. Defaults to true.
     * @param {Boolean}             [options.shy]               If the datepicker should start automatically. Defaults to true.
     * @param {String}              [options.startDate]         Date to define initial month. Must be in yyyy-mm-dd format.
     * @param {Number}              [options.startWeekDay]      First day of the week. Sunday is zero. Defaults to 1 (Monday).
     * @param {Function}            [options.validYearFn]       Callback to execute when 'rendering' the month (in the month view)
     * @param {Function}            [options.validMonthFn]      Callback to execute when 'rendering' the month (in the month view)
     * @param {Function}            [options.validDayFn]        Callback to execute when 'rendering' the day (in the month view)
     * @param {Function}            [options.nextValidDateFn]   Function to calculate the next valid date, given the current. Useful when there's invalid dates or time frames.
     * @param {Function}            [options.prevValidDateFn]   Function to calculate the previous valid date, given the current. Useful when there's invalid dates or time frames.
     * @param {Object}              [options.wDay]              Hash of weekdays. Defaults to portuguese names. Sunday is 0.
     * @param {String}              [options.yearRange]         Enforce limits to year for the Date, ex: '1990:2020' (deprecated)
     *
     * @sample Ink_UI_DatePicker_1.html
     */
    var DatePicker = function(selector, options) {
        this._element = selector &&
            Common.elOrSelector(selector, '[Ink.UI.DatePicker_1]: selector argument');

        this._options = Common.options('Ink.UI.DatePicker_1', {
            autoOpen:        ['Boolean', false],
            cleanText:       ['String', 'Clear'],
            closeText:       ['String', 'Close'],
            containerElement:['Element', null],
            cssClass:        ['String', 'ink-calendar bottom'],
            dateRange:       ['String', null],
            
            // use this in a <select>
            displayInSelect: ['Boolean', false],
            dayField:        ['Element', null],
            monthField:      ['Element', null],
            yearField:       ['Element', null],

            format:          ['String', 'yyyy-mm-dd'],
            instance:        ['String', 'scdp_' + Math.round(99999 * Math.random())],
            nextLinkText:    ['String', '»'],
            ofText:          ['String', ' de '],
            onFocus:         ['Boolean', true],
            onMonthSelected: ['Function', null],
            onSetDate:       ['Function', null],
            onYearSelected:  ['Function', null],
            position:        ['String', 'right'],
            prevLinkText:    ['String', '«'],
            showClean:       ['Boolean', true],
            showClose:       ['Boolean', true],
            shy:             ['Boolean', true],
            startDate:       ['String', null], // format yyyy-mm-dd,
            startWeekDay:    ['Number', 1],

            // Validation
            validDayFn:      ['Function', null],
            validMonthFn:    ['Function', null],
            validYearFn:     ['Function', null],
            nextValidDateFn: ['Function', null],
            prevValidDateFn: ['Function', null],
            yearRange:       ['String', null],

            // Text
            month: ['Object', {
                 1:'January',
                 2:'February',
                 3:'March',
                 4:'April',
                 5:'May',
                 6:'June',
                 7:'July',
                 8:'August',
                 9:'September',
                10:'October',
                11:'November',
                12:'December'
            }],
            wDay: ['Object', {
                0:'Sunday',
                1:'Monday',
                2:'Tuesday',
                3:'Wednesday',
                4:'Thursday',
                5:'Friday',
                6:'Saturday'
            }]
        }, options || {}, this._element);

        this._options.format = this._dateParsers[ this._options.format ] || this._options.format;

        this._hoverPicker = false;

        this._picker = this._options.pickerField &&
            Common.elOrSelector(this._options.pickerField, 'pickerField');

        this._setMinMax( this._options.dateRange || this._options.yearRange );

        if(this._options.startDate) {
            this.setDate( this._options.startDate );
        } else if (this._element && this._element.value) {
            this.setDate( this._element.value );
        } else {
            var today = new Date();
            this._day   = today.getDate( );
            this._month = today.getMonth( );
            this._year  = today.getFullYear( );
        }

        if (this._options.startWeekDay < 0 || this._options.startWeekDay > 6) {
            Ink.warn('Ink.UI.DatePicker_1: option "startWeekDay" must be between 0 (sunday) and 6 (saturday)');
            this._options.startWeekDay = clamp(this._options.startWeekDay, 0, 6);
        }

        if(this._options.displayInSelect &&
                !(this._options.dayField && this._options.monthField && this._options.yearField)){
            throw new Error(
                'Ink.UI.DatePicker: displayInSelect option enabled.'+
                'Please specify dayField, monthField and yearField selectors.');
        }

        this._init();
    };

    DatePicker.prototype = {
        version: '0.1',

        /**
         * Initialization function. Called by the constructor and receives the same parameters.
         *
         * @method _init
         * @private
         */
        _init: function(){
            Ink.extendObj(this._options,this._lang || {});

            this._render();
            this._listenToContainerObjectEvents();

            Common.registerInstance(this, this._containerObject, 'datePicker');
        },

        /**
         * Renders the DatePicker's markup.
         *
         * @method _render
         * @private
         */
        _render: function() {
            this._containerObject = document.createElement('div');

            this._containerObject.id = this._options.instance;

            this._containerObject.className = this._options.cssClass + ' ink-datepicker-calendar hide-all';

            this._renderSuperTopBar();

            var calendarTop = document.createElement("div");
            calendarTop.className = 'ink-calendar-top';

            this._monthDescContainer = document.createElement("div");
            this._monthDescContainer.className = 'ink-calendar-month_desc';

            this._monthPrev = document.createElement('div');
            this._monthPrev.className = 'ink-calendar-prev';
            this._monthPrev.innerHTML ='<a href="#prev" class="change_month_prev">' + this._options.prevLinkText + '</a>';

            this._monthNext = document.createElement('div');
            this._monthNext.className = 'ink-calendar-next';
            this._monthNext.innerHTML ='<a href="#next" class="change_month_next">' + this._options.nextLinkText + '</a>';

            calendarTop.appendChild(this._monthPrev);
            calendarTop.appendChild(this._monthDescContainer);
            calendarTop.appendChild(this._monthNext);

            this._monthContainer = document.createElement("div");
            this._monthContainer.className = 'ink-calendar-month';

            this._containerObject.appendChild(calendarTop);
            this._containerObject.appendChild(this._monthContainer);

            this._monthSelector = this._renderMonthSelector();
            this._containerObject.appendChild(this._monthSelector);

            this._yearSelector = document.createElement('ul');
            this._yearSelector.className = 'ink-calendar-year-selector';

            this._containerObject.appendChild(this._yearSelector);

            if(!this._options.onFocus || this._options.displayInSelect){
                if(!this._options.pickerField){
                    this._picker = document.createElement('a');
                    this._picker.href = '#open_cal';
                    this._picker.innerHTML = 'open';
                    this._element.parentNode.appendChild(this._picker);
                    this._picker.className = 'ink-datepicker-picker-field';
                } else {
                    this._picker = Common.elOrSelector(this._options.pickerField, 'pickerField');
                }
            }

            this._appendDatePickerToDom();

            this._renderMonth();

            this._monthChanger = document.createElement('a');
            this._monthChanger.href = '#monthchanger';
            this._monthChanger.className = 'ink-calendar-link-month';
            this._monthChanger.innerHTML = this._options.month[this._month + 1];

            this._ofText = document.createElement('span');
            this._ofText.innerHTML = this._options.ofText;

            this._yearChanger = document.createElement('a');
            this._yearChanger.href = '#yearchanger';
            this._yearChanger.className = 'ink-calendar-link-year';
            this._yearChanger.innerHTML = this._year;
            this._monthDescContainer.innerHTML = '';
            this._monthDescContainer.appendChild(this._monthChanger);
            this._monthDescContainer.appendChild(this._ofText);
            this._monthDescContainer.appendChild(this._yearChanger);

            if (!this._options.inline) {
                this._addOpenCloseEvents();
            } else {
                this.show();
            }
            this._addDateChangeHandlersToInputs();
        },

        _addDateChangeHandlersToInputs: function () {
            var fields = this._element;
            if (this._options.displayInSelect) {
                fields = [
                    this._options.dayField,
                    this._options.monthField,
                    this._options.yearField];
            }
            Event.observeMulti(fields ,'change', Ink.bindEvent(function(){
                this._updateDate( );
                this._showDefaultView( );
                this.setDate( );
                if ( !this._inline && !this._hoverPicker ) {
                    this._hide(true);
                }
            },this));
        },

        /**
         * Shows the calendar.
         *
         * @method show
         **/
        show: function () {
            this._updateDate();
            this._renderMonth();
            Css.removeClassName(this._containerObject, 'hide-all');
        },

        _addOpenCloseEvents: function () {
            var opener = this._picker || this._element;

            Event.observe(opener, 'click', Ink.bindEvent(function(e){
                Event.stop(e);
                this.show();
            },this));

            if (this._options.autoOpen) {
                this.show();
            }

            if(!this._options.displayInSelect){
                Event.observe(opener, 'blur', Ink.bindEvent(function() {
                    if ( !this._hoverPicker ) {
                        this._hide(true);
                    }
                },this));
            }

            if (this._options.shy) {
                // Close the picker when clicking elsewhere.
                Event.observe(document,'click',Ink.bindEvent(function(e){
                    var target = Event.element(e);

                    // "elsewhere" is outside any of these elements:
                    var cannotBe = [
                        this._options.dayField,
                        this._options.monthField,
                        this._options.yearField,
                        this._picker,
                        this._element
                    ];

                    for (var i = 0, len = cannotBe.length; i < len; i++) {
                        if (cannotBe[i] && InkElement.descendantOf(cannotBe[i], target)) {
                            return;
                        }
                    }

                    this._hide(true);
                },this));
            }
        },

        /**
         * Creates the markup of the view with months.
         *
         * @method _renderMonthSelector
         * @private
         */
        _renderMonthSelector: function () {
            var selector = document.createElement('ul');
            selector.className = 'ink-calendar-month-selector';

            var ulSelector = document.createElement('ul');
            for(var mon=1; mon<=12; mon++){
                ulSelector.appendChild(this._renderMonthButton(mon));

                if (mon % 4 === 0) {
                    selector.appendChild(ulSelector);
                    ulSelector = document.createElement('ul');
                }
            }
            return selector;
        },

        /**
         * Renders a single month button.
         */
        _renderMonthButton: function (mon) {
            var liMonth = document.createElement('li');
            var aMonth = document.createElement('a');
            aMonth.setAttribute('data-cal-month', mon);
            aMonth.innerHTML = this._options.month[mon].substring(0,3);
            liMonth.appendChild(aMonth);
            return liMonth;
        },

        _appendDatePickerToDom: function () {
            if(this._options.containerElement) {
                var appendTarget =
                    Ink.i(this._options.containerElement) ||  // [2.3.0] maybe id; small backwards compatibility thing
                    Common.elOrSelector(this._options.containerElement);
                appendTarget.appendChild(this._containerObject);
            }

            if (InkElement.findUpwardsBySelector(this._element, '.ink-form .control-group .control') === this._element.parentNode) {
                // [3.0.0] Check if the <input> must be a direct child of .control, and if not, remove this block.
                this._wrapper = this._element.parentNode;
                this._wrapperIsControl = true;
            } else {
                this._wrapper = InkElement.create('div', { className: 'ink-datepicker-wrapper' });
                InkElement.wrap(this._element, this._wrapper);
            }
            InkElement.insertAfter(this._containerObject, this._element);
        },

        /**
         * Render the topmost bar with the "close" and "clear" buttons.
         */
        _renderSuperTopBar: function () {
            if((!this._options.showClose) || (!this._options.showClean)){ return; }

            this._superTopBar = document.createElement("div");
            this._superTopBar.className = 'ink-calendar-top-options';
            if(this._options.showClean){
                this._superTopBar.appendChild(InkElement.create('a', {
                    className: 'clean',
                    setHTML: this._options.cleanText
                }));
            }
            if(this._options.showClose){
                this._superTopBar.appendChild(InkElement.create('a', {
                    className: 'close',
                    setHTML: this._options.closeText
                }));
            }
            this._containerObject.appendChild(this._superTopBar);
        },

        _listenToContainerObjectEvents: function () {
            Event.observe(this._containerObject,'mouseover',Ink.bindEvent(function(e){
                Event.stop( e );
                this._hoverPicker = true;
            },this));

            Event.observe(this._containerObject,'mouseout',Ink.bindEvent(function(e){
                Event.stop( e );
                this._hoverPicker = false;
            },this));

            Event.observe(this._containerObject,'click',Ink.bindEvent(this._onClick, this));
        },

        _onClick: function(e){
            var elem = Event.element(e);

            if (Css.hasClassName(elem, 'ink-calendar-off')) {
                Event.stopDefault(e);
                return null;
            }

            Event.stop(e);

            // Relative changers
            this._onRelativeChangerClick(elem);

            // Absolute changers
            this._onAbsoluteChangerClick(elem);

            // Mode changers
            if (Css.hasClassName(elem, 'ink-calendar-link-month')) {
                this._showMonthSelector();
            } else if (Css.hasClassName(elem, 'ink-calendar-link-year')) {
                this._showYearSelector();
            } else if(Css.hasClassName(elem, 'clean')){
                this._clean();
            } else if(Css.hasClassName(elem, 'close')){
                this._hide(false);
            }

            this._updateDescription();
        },

        /**
         * Handles click events on a changer (« ») for next/prev year/month
         * @method _onChangerClick
         * @private
         **/
        _onRelativeChangerClick: function (elem) {
            var changeYear = {
                change_year_next: 1,
                change_year_prev: -1
            };
            var changeMonth = {
                change_month_next: 1,
                change_month_prev: -1
            };

            if( elem.className in changeMonth ) {
                this._updateCal(changeMonth[elem.className]);
            } else if( elem.className in changeYear ) {
                this._showYearSelector(changeYear[elem.className]);
            }
        },

        /**
         * Handles click events on an atom-changer (day button, month button, year button)
         *
         * @method _onAbsoluteChangerClick
         * @private
         */
        _onAbsoluteChangerClick: function (elem) {
            var elemData = InkElement.data(elem);

            if( Number(elemData.calDay) ){
                this.setDate( [this._year, this._month + 1, elemData.calDay].join('-') );
                this._hide();
            } else if( Number(elemData.calMonth) ) {
                this._month = Number(elemData.calMonth) - 1;
                this._showDefaultView();
                this._updateCal();
            } else if( Number(elemData.calYear) ){
                this._changeYear(Number(elemData.calYear));
            }
        },

        _changeYear: function (year) {
            year = +year;
            if(year){
                this._year = year;
                if( typeof this._options.onYearSelected === 'function' ){
                    this._options.onYearSelected(this, {
                        'year': this._year
                    });
                }
                this._showMonthSelector();
            }
        },

        _clean: function () {
            if(this._options.displayInSelect){
                this._options.yearField.selectedIndex = 0;
                this._options.monthField.selectedIndex = 0;
                this._options.dayField.selectedIndex = 0;
            } else {
                this._element.value = '';
            }
        },

        /**
         * Hides the DatePicker.
         * If the component is shy (options.shy), behaves differently.
         *
         * @method _hide
         * @param {Boolean}    [blur]   If false, forces hiding even if the component is shy.
         */
        _hide: function(blur) {
            blur = blur === undefined ? true : blur;
            if (blur === false || (blur && this._options.shy)) {
                Css.addClassName(this._containerObject, 'hide-all');
            }
        },

        /**
         * Sets the range of dates allowed to be selected in the Date Picker
         *
         * @method _setMinMax
         * @param {String} dateRange Two dates separated by a ':'. Example: 2013-01-01:2013-12-12
         * @private
         */
        _setMinMax: function( dateRange ) {
            var self = this;

            var noMinLimit = {
                _year: -Number.MAX_VALUE,
                _month: 0,
                _day: 1
            };

            var noMaxLimit = {
                _year: Number.MAX_VALUE,
                _month: 11,
                _day: 31
            };

            function noLimits() {
                self._min = noMinLimit;
                self._max = noMaxLimit;
            }

            if (!dateRange) { return noLimits(); }

            var dates = dateRange.split( ':' );
            var rDate = /^(\d{4})((\-)(\d{1,2})((\-)(\d{1,2}))?)?$/;

            InkArray.each([
                        {name: '_min', date: dates[0], noLim: noMinLimit},
                        {name: '_max', date: dates[1], noLim: noMaxLimit}
                    ], Ink.bind(function (data) {

                var lim = data.noLim;

                if ( data.date.toUpperCase() === 'NOW' ) {
                    var now = new Date();
                    lim = dateishFromDate(now);
                } else if (data.date.toUpperCase() === 'EVER') {
                    lim = data.noLim;
                } else if ( rDate.test( data.date ) ) {
                    lim = dateishFromYMDString(data.date);

                    lim._month = clamp(lim._month, 0, 11);
                    lim._day = clamp(lim._day, 1, this._daysInMonth( lim._year, lim._month + 1 ));
                }

                this[data.name] = lim;
            }, this));

            // Should be equal, or min should be smaller
            var valid = this._dateCmp(this._max, this._min) !== -1;

            if (!valid) {
                noLimits();
            }
        },

        /**
         * Checks if a date is between the valid range.
         * Starts by checking if the date passed is valid. If not, will fallback to the 'today' date.
         * Then checks if the all params are inside of the date range specified. If not, it will fallback to the nearest valid date (either Min or Max).
         *
         * @method _fitDateToRange
         * @param  {Number} year  Year with 4 digits (yyyy)
         * @param  {Number} month Month
         * @param  {Number} day   Day
         * @return {Array}       Array with the final processed date.
         * @private
         */
        _fitDateToRange: function( date ) {
            if ( !this._isValidDate( date ) ) {
                date = dateishFromDate(new Date());
            }

            if (this._dateCmp(date, this._min) === -1) {
                return Ink.extendObj({}, this._min);
            } else if (this._dateCmp(date, this._max) === 1) {
                return Ink.extendObj({}, this._max);
            }

            return Ink.extendObj({}, date);  // date is okay already, just copy it.
        },

        /**
         * Checks whether a date is within the valid date range
         * @method _dateWithinRange
         * @param year
         * @param month
         * @param day
         * @return {Boolean}
         * @private
         */
        _dateWithinRange: function (date) {
            if (!arguments.length) {
                date = this;
            }

            return  (!this._dateAboveMax(date) &&
                    (!this._dateBelowMin(date)));
        },

        _dateAboveMax: function (date) {
            return this._dateCmp(date, this._max) === 1;
        },

        _dateBelowMin: function (date) {
            return this._dateCmp(date, this._min) === -1;
        },

        _dateCmp: function (self, oth) {
            return this._dateCmpUntil(self, oth, '_day');
        },

        /**
         * _dateCmp with varied precision. You can compare down to the day field, or, just to the month.
         * // the following two dates are considered equal because we asked
         * // _dateCmpUntil to just check up to the years.
         *
         * _dateCmpUntil({_year: 2000, _month: 10}, {_year: 2000, _month: 11}, '_year') === 0
         */
        _dateCmpUntil: function (self, oth, depth) {
            var props = ['_year', '_month', '_day'];
            var i = -1;

            do {
                i++;
                if      (self[props[i]] > oth[props[i]]) { return 1; }
                else if (self[props[i]] < oth[props[i]]) { return -1; }
            } while (props[i] !== depth &&
                    self[props[i + 1]] !== undefined && oth[props[i + 1]] !== undefined);

            return 0;
        },

        /**
         * Sets the markup in the default view mode (showing the days).
         * Also disables the previous and next buttons in case they don't meet the range requirements.
         *
         * @method _showDefaultView
         * @private
         */
        _showDefaultView: function(){
            this._yearSelector.style.display = 'none';
            this._monthSelector.style.display = 'none';
            this._monthPrev.childNodes[0].className = 'change_month_prev';
            this._monthNext.childNodes[0].className = 'change_month_next';

            if ( !this._getPrevMonth() ) {
                this._monthPrev.childNodes[0].className = 'action_inactive';
            }

            if ( !this._getNextMonth() ) {
                this._monthNext.childNodes[0].className = 'action_inactive';
            }

            this._monthContainer.style.display = 'block';
        },

        /**
         * Updates the date shown on the datepicker
         *
         * @method _updateDate
         * @private
         */
        _updateDate: function(){
            var dataParsed;
            if(!this._options.displayInSelect && this._element.value){
                dataParsed = this._parseDate(this._element.value);
            } else if (this._options.displayInSelect) {
                dataParsed = {
                    _year: this._options.yearField[this._options.yearField.selectedIndex].value,
                    _month: this._options.monthField[this._options.monthField.selectedIndex].value - 1,
                    _day: this._options.dayField[this._options.dayField.selectedIndex].value
                };
            }

            if (dataParsed) {
                dataParsed = this._fitDateToRange(dataParsed);
                this._year = dataParsed._year;
                this._month = dataParsed._month;
                this._day = dataParsed._day;
            }
            this.setDate();
            this._updateDescription();
            this._renderMonth();
        },

        /**
         * Updates the date description shown at the top of the datepicker
         *
         * EG "12 de November"
         *
         * @method  _updateDescription
         * @private
         */
        _updateDescription: function(){
            this._monthChanger.innerHTML = this._options.month[ this._month + 1 ];
            this._ofText.innerHTML = this._options.ofText;
            this._yearChanger.innerHTML = this._year;
        },

        /**
         * Renders the year selector view of the datepicker
         *
         * @method _showYearSelector
         * @private
         */
        _showYearSelector: function(inc){
            this._incrementViewingYear(inc);

            var firstYear = this._year - (this._year % 10);
            var thisYear = firstYear - 1;
            var str = "<li><ul>";

            if (thisYear > this._min._year) {
                str += '<li><a href="#year_prev" class="change_year_prev">' + this._options.prevLinkText + '</a></li>';
            } else {
                str += '<li>&nbsp;</li>';
            }

            for (var i=1; i < 11; i++){
                if (i % 4 === 0){
                    str+='</ul><ul>';
                }

                thisYear = firstYear + i - 1;

                str += this._getYearButtonHtml(thisYear);
            }

            if( thisYear < this._max._year){
                str += '<li><a href="#year_next" class="change_year_next">' + this._options.nextLinkText + '</a></li>';
            } else {
                str += '<li>&nbsp;</li>';
            }

            str += "</ul></li>";

            this._yearSelector.innerHTML = str;
            this._monthPrev.childNodes[0].className = 'action_inactive';
            this._monthNext.childNodes[0].className = 'action_inactive';
            this._monthSelector.style.display = 'none';
            this._monthContainer.style.display = 'none';
            this._yearSelector.style.display = 'block';
        },

        /**
         * For the year selector.
         *
         * Update this._year, to find the next decade or use nextValidDateFn to find it.
         */
        _incrementViewingYear: function (inc) {
            if (!inc) { return; }

            var year = +this._year + inc*10;
            year = year - year % 10;
            if ( year > this._max._year || year + 9 < this._min._year){
                return;
            }
            this._year = +this._year + inc*10;
        },

        _getYearButtonHtml: function (thisYear) {
            if ( this._acceptableYear({_year: thisYear}) ){
                var className = (thisYear === this._year) ? ' class="ink-calendar-on"' : '';
                return '<li><a href="#" data-cal-year="' + thisYear + '"' + className + '>' + thisYear +'</a></li>';
            } else {
                return '<li><a href="#" class="ink-calendar-off">' + thisYear +'</a></li>';

            }
        },

        /**
         * Show the month selector (happens when you click a year, or the "month" link.
         * @method _showMonthSelector
         * @private
         */
        _showMonthSelector: function () {
            this._yearSelector.style.display = 'none';
            this._monthContainer.style.display = 'none';
            this._monthPrev.childNodes[0].className = 'action_inactive';
            this._monthNext.childNodes[0].className = 'action_inactive';
            this._addMonthClassNames();
            this._monthSelector.style.display = 'block';
        },

        /**
         * This function returns the given date in the dateish format
         *
         * @method _parseDate
         * @param {String} dateStr A date on a string.
         * @private
         */
        _parseDate: function(dateStr){
            var date = InkDate.set( this._options.format , dateStr );
            if (date) {
                return dateishFromDate(date);
            }
            return null;
        },

        /**
         * Checks if a date is valid
         *
         * @method _isValidDate
         * @param {Dateish} date
         * @private
         * @return {Boolean} True if the date is valid, false otherwise
         */
        _isValidDate: function(date){
            var yearRegExp = /^\d{4}$/;
            var validOneOrTwo = /^\d{1,2}$/;
            return (
                yearRegExp.test(date._year)     &&
                validOneOrTwo.test(date._month) &&
                validOneOrTwo.test(date._day)   &&
                +date._month + 1 >= 1  &&
                +date._month + 1 <= 12 &&
                +date._day       >= 1  &&
                +date._day       <= this._daysInMonth(date._year, date._month + 1)
            );
        },

        /**
         * Checks if a given date is an valid format.
         *
         * @method _isDate
         * @param {String} format A date format.
         * @param {String} dateStr A date on a string.
         * @private
         * @return {Boolean} True if the given date is valid according to the given format
         */
        _isDate: function(format, dateStr){
            try {
                if (typeof format === 'undefined'){
                    return false;
                }
                var date = InkDate.set( format , dateStr );
                if( date && this._isValidDate( dateishFromDate(date) )) {
                    return true;
                }
            } catch (ex) {}

            return false;
        },

        _acceptableDay: function (date) {
            return this._acceptableDateComponent(date, 'validDayFn');
        },

        _acceptableMonth: function (date) {
            return this._acceptableDateComponent(date, 'validMonthFn');
        },

        _acceptableYear: function (date) {
            return this._acceptableDateComponent(date, 'validYearFn');
        },

        /** DRY base for the above 2 functions */
        _acceptableDateComponent: function (date, userCb) {
            if (this._options[userCb]) {
                return this._callUserCallbackBool(this._options[userCb], date);
            } else {
                return this._dateWithinRange(date);
            }
        },

        /**
         * This method returns the date written with the format specified on the options
         *
         * @method _writeDateInFormat
         * @private
         * @return {String} Returns the current date of the object in the specified format
         */
        _writeDateInFormat:function(){
            return InkDate.get( this._options.format , this.getDate());
        },

        /**
         * This method allows the user to set the DatePicker's date on run-time.
         *
         * @method setDate
         * @param {String} dateString A date string in yyyy-mm-dd format.
         * @public
         */
        setDate: function( dateString ) {
            if ( /\d{4}-\d{1,2}-\d{1,2}/.test( dateString ) ) {
                var auxDate = dateString.split( '-' );
                this._year  = +auxDate[ 0 ];
                this._month = +auxDate[ 1 ] - 1;
                this._day   = +auxDate[ 2 ];
            }

            this._setDate( );
        },

        /**
         * Gets the currently selected date as a JavaScript date.
         *
         * @method getDate
         */
        getDate: function () {
            if (!this._day) {
                throw 'Ink.UI.DatePicker: Still picking a date. Cannot getDate now!';
            }
            return new Date(this._year, this._month, this._day);
        },

        /**
         * Sets the chosen date on the target input field
         *
         * @method _setDate
         * @param {DOMElement} objClicked Clicked object inside the DatePicker's calendar.
         * @private
         */
        _setDate : function( objClicked ) {
            if (objClicked) {
                var data = InkElement.data(objClicked);
                this._day = (+data.calDay) || this._day;
            }

            var dt = this._fitDateToRange(this);

            this._year = dt._year;
            this._month = dt._month;
            this._day = dt._day;

            if(!this._options.displayInSelect){
                this._element.value = this._writeDateInFormat();
            } else {
                this._options.dayField.value   = this._day;
                this._options.monthField.value = this._month + 1;
                this._options.yearField.value  = this._year;
            }

            if(this._options.onSetDate) {
                this._options.onSetDate( this , { date : this.getDate() } );
            }
        },

        /**
         * Makes the necessary work to update the calendar
         * when choosing a different month
         *
         * @method _updateCal
         * @param {Number} inc Indicates previous or next month
         * @private
         */
        _updateCal: function(inc){
            if( typeof this._options.onMonthSelected === 'function' ){
                this._options.onMonthSelected(this, {
                    'year': this._year,
                    'month' : this._month
                });
            }
            if (inc && this._updateMonth(inc) === null) {
                return;
            }
            this._renderMonth();
        },

        /**
         * Function that returns the number of days on a given month on a given year
         *
         * @method _daysInMonth
         * @param {Number} _y - year
         * @param {Number} _m - month
         * @private
         * @return {Number} The number of days on a given month on a given year
         */
        _daysInMonth: function(_y,_m){
            var exceptions = {
                2: ((_y % 400 === 0) || (_y % 4 === 0 && _y % 100 !== 0)) ? 29 : 28,
                4: 30,
                6: 30,
                9: 30,
                11: 30
            };

            return exceptions[_m] || 31;
        },


        /**
         * Updates the calendar when a different month is chosen
         *
         * @method _updateMonth
         * @param {Number} incValue - indicates previous or next month
         * @private
         */
        _updateMonth: function(incValue){
            var date;
            if (incValue > 0) {
                date = this._getNextMonth();
            } else if (incValue < 0) {
                date = this._getPrevMonth();
            }
            if (!date) { return null; }
            this._year = date._year;
            this._month = date._month;
            this._day = date._day;
        },

        /**
         * Get the next month we can show.
         */
        _getNextMonth: function (date) {
            return this._tryLeap( date, 'Month', 'next', function (d) {
                    d._month += 1;
                    if (d._month > 11) {
                        d._month = 0;
                        d._year += 1;
                    }
                    return d;
                });
        },

        /**
         * Get the previous month we can show.
         */
        _getPrevMonth: function (date) {
            return this._tryLeap( date, 'Month', 'prev', function (d) {
                    d._month -= 1;
                    if (d._month < 0) {
                        d._month = 11;
                        d._year -= 1;
                    }
                    return d;
                });
        },

        /**
         * Get the next year we can show.
         */
        _getPrevYear: function (date) {
            return this._tryLeap( date, 'Year', 'prev', function (d) {
                    d._year -= 1;
                    return d;
                });
        },

        /**
         * Get the next year we can show.
         */
        _getNextYear: function (date) {
            return this._tryLeap( date, 'Year', 'next', function (d) {
                    d._year += 1;
                    return d;
                });
        },

        /**
         * DRY base for a function which tries to get the next or previous valid year or month.
         *
         * It checks if we can go forward by using _dateCmp with atomic
         * precision (this means, {_year} for leaping years, and
         * {_year, month} for leaping months), then it tries to get the
         * result from the user-supplied callback (nextDateFn or prevDateFn),
         * and when this is not present, advance the date forward using the
         * `advancer` callback.
         */
        _tryLeap: function (date, atomName, directionName, advancer) {
            date = date || { _year: this._year, _month: this._month, _day: this._day };

            var maxOrMin = directionName === 'prev' ? '_min' : '_max';
            var boundary = this[maxOrMin];

            // Check if we're by the boundary of min/max year/month
            if (this._dateCmpUntil(date, boundary, atomName) === 0) {
                return null;  // We're already at the boundary. Bail.
            }

            var leapUserCb = this._options[directionName + 'ValidDateFn'];
            if (leapUserCb) {
                return this._callUserCallbackDate(leapUserCb, date);
            } else {
                date = advancer(date);
            }

            date = this._fitDateToRange(date);

            return this['_acceptable' + atomName](date) ? date : null;
        },

        _getNextDecade: function (date) {
            date = date || { _year: this._year, _month: this._month, _day: this._day };
            var decade = this._getCurrentDecade(date);
            if (decade + 10 > this._max._year) { return null; }
            return decade + 10;
        },

        _getPrevDecade: function (date) {
            date = date || { _year: this._year, _month: this._month, _day: this._day };
            var decade = this._getCurrentDecade(date);
            if (decade - 10 < this._min._year) { return null; }
            return decade - 10;
        },

        /** Returns the decade given a date or year*/
        _getCurrentDecade: function (year) {
            year = year ? (year._year || year) : this._year;
            return Math.floor(year / 10) * 10;  // Round to first place
        },

        _callUserCallbackBase: function (cb, date) {
            return cb.call(this, date._year, date._month + 1, date._day);
        },

        _callUserCallbackBool: function (cb, date) {
            return !!this._callUserCallbackBase(cb, date);
        },

        _callUserCallbackDate: function (cb, date) {
            var ret = this._callUserCallbackBase(cb, date);
            return ret ? dateishFromDate(ret) : null;
        },

        /**
         * Key-value object that (for a given key) points to the correct parsing format for the DatePicker
         * @property _dateParsers
         * @type {Object}
         * @readOnly
         */
        _dateParsers: {
            'yyyy-mm-dd' : 'Y-m-d' ,
            'yyyy/mm/dd' : 'Y/m/d' ,
            'yy-mm-dd'   : 'y-m-d' ,
            'yy/mm/dd'   : 'y/m/d' ,
            'dd-mm-yyyy' : 'd-m-Y' ,
            'dd/mm/yyyy' : 'd/m/Y' ,
            'dd-mm-yy'   : 'd-m-y' ,
            'dd/mm/yy'   : 'd/m/y' ,
            'mm/dd/yyyy' : 'm/d/Y' ,
            'mm-dd-yyyy' : 'm-d-Y'
        },

        /**
         * Renders the current month
         *
         * @method _renderMonth
         * @private
         */
        _renderMonth: function(){
            var month = this._month;
            var year = this._year;

            this._showDefaultView();

            var html = '';

            html += this._getMonthCalendarHeaderHtml(this._options.startWeekDay);

            var counter = 0;
            html+='<ul>';

            var emptyHtml = '<li class="ink-calendar-empty">&nbsp;</li>';

            var firstDayIndex = this._getFirstDayIndex(year, month);

            // Add padding if the first day of the month is not monday.
            if(firstDayIndex > 0) {
                counter += firstDayIndex;
                html += strRepeat(firstDayIndex, emptyHtml);
            }

            html += this._getDayButtonsHtml(year, month);

            html += '</ul>';

            this._monthContainer.innerHTML = html;
        },

        /**
         * Figure out where the first day of a month lies
         * in the first row of the calendar.
         *
         *      having options.startWeekDay === 0
         *
         *      Su Mo Tu We Th Fr Sa  
         *                         1  <- The "1" is in the 7th day. return 6.
         *       2  3  4  5  6  7  8  
         *       9 10 11 12 13 14 15  
         *      16 17 18 19 20 21 22  
         *      23 24 25 26 27 28 29  
         *      30 31
         *
         * This obviously changes according to the user option "startWeekDay"
         **/
        _getFirstDayIndex: function (year, month) {
            var wDayFirst = (new Date( year , month , 1 )).getDay();  // Sunday=0
            var startWeekDay = this._options.startWeekDay || 0;  // Sunday=0

            var result = wDayFirst - startWeekDay;

            result %= 7;

            if (result < 0) {
                result += 6;
            }

            return result;
        },

        _getDayButtonsHtml: function (year, month) {
            var counter = this._getFirstDayIndex(year, month);
            var daysInMonth = this._daysInMonth(year, month + 1);
            var ret = '';
            for (var day = 1; day <= daysInMonth; day++) {
                if (counter === 7){ // new week
                    counter=0;
                    ret += '<ul>';
                }

                ret += this._getDayButtonHtml(year, month, day);

                counter++;
                if(counter === 7){
                    ret += '</ul>';
                }
            }
            return ret;
        },

        /**
         * Get the HTML markup for a single day in month view, given year, month, day.
         *
         * @method _getDayButtonHtml
         * @private
         */
        _getDayButtonHtml: function (year, month, day) {
            var attrs = ' ';
            var date = dateishFromYMD(year, month, day);
            if (!this._acceptableDay(date)) {
                attrs += 'class="ink-calendar-off"';
            } else {
                attrs += 'data-cal-day="' + day + '"';
            }

            if (this._day && this._dateCmp(date, this) === 0) {
                attrs += 'class="ink-calendar-on" data-cal-day="' + day + '"';
            }

            return '<li><a href="#" ' + attrs + '>' + day + '</a></li>';   
        },

        /** Write the top bar of the calendar (M T W T F S S) */
        _getMonthCalendarHeaderHtml: function (startWeekDay) {
            var ret = '<ul class="ink-calendar-header">';
            var wDay;
            for(var i=0; i<7; i++){
                wDay = (startWeekDay + i) % 7;
                ret += '<li>' +
                    this._options.wDay[wDay].substring(0,1) +
                    '</li>';
            }
            return ret + '</ul>';
        },

        /**
         * This method adds class names to month buttons, to visually distinguish.
         *
         * @method _addMonthClassNames
         * @param {DOMElement} parent DOMElement where all the months are.
         * @private
         */
        _addMonthClassNames: function(parent){
            InkArray.forEach(
                (parent || this._monthSelector).getElementsByTagName('a'),
                Ink.bindMethod(this, '_addMonthButtonClassNames'));
        },

        /**
         * Add the ink-calendar-on className if the given button is the current month,
         * otherwise add the ink-calendar-off className if the given button refers to
         * an unacceptable month (given dateRange and validMonthFn)
         */
        _addMonthButtonClassNames: function (btn) {
            var data = InkElement.data(btn);
            if (!data.calMonth) { throw 'not a calendar month button!'; }

            var month = +data.calMonth - 1;

            if ( month === this._month ) {
                Css.addClassName( btn, 'ink-calendar-on' );  // This month
                Css.removeClassName( btn, 'ink-calendar-off' );
            } else {
                Css.removeClassName( btn, 'ink-calendar-on' );  // Not this month

                var toDisable = !this._acceptableMonth({_year: this._year, _month: month});
                Css.addRemoveClassName( btn, 'ink-calendar-off', toDisable);
            }
        },

        /*
         * // TODO implement this
         * Prototype's method to allow the 'i18n files' to change all objects' language at once.
         * @param {Object} options                  Object with the texts' configuration.
         * @param {String} options.closeText        Text of the close anchor
         * @param {String} options.cleanText        Text of the clean text anchor
         * @param {String} options.prevLinkText     "Previous" link's text
         * @param {String} options.nextLinkText     "Next" link's text
         * @param {String} options.ofText           The text "of", present in 'May of 2013'
         * @param {Object} options.month            An object with keys from 1 to 12 for the full months' names
         * @param {Object} options.wDay             An object with keys from 0 to 6 for the full weekdays' names
         * @public
         */
        lang: function( options ){
            this._lang = options;
        },

        /**
         * This calls the rendering of the selected month. (Deprecated: use show() instead)
         *
         */
        showMonth: function(){
            this._renderMonth();
        },

        /**
         * Checks if the calendar screen is in 'select day' mode
         * 
         * @method isMonthRendered
         * @return {Boolean} True if the calendar screen is in 'select day' mode
         * @public
         */
        isMonthRendered: function(){
            var header = Selector.select('.ink-calendar-header', this._containerObject)[0];

            return ((Css.getStyle(header.parentNode,'display') !== 'none') &&
                    (Css.getStyle(header.parentNode.parentNode,'display') !== 'none') );
        },

        /**
         * Destroys this datepicker, removing it from the page.
         *
         * @method destroy
         * @public
         **/
        destroy: function () {
            InkElement.unwrap(this._element);
            InkElement.remove(this._wrapper);
            InkElement.remove(this._containerObject);
            Common.unregisterInstance.call(this);
        }
    };

    return DatePicker;
});
/**
 * Dragging elements around
 * @module Ink.UI.Draggable_1
 * @version 1
 */
 
Ink.createModule("Ink.UI.Draggable","1",["Ink.Dom.Element_1", "Ink.Dom.Event_1", "Ink.Dom.Css_1", "Ink.Dom.Browser_1", "Ink.Dom.Selector_1", "Ink.UI.Common_1"],function( InkElement, InkEvent, Css, Browser, Selector, Common) {
    'use strict';

    var x = 0,
        y = 1;  // For accessing coords in [x, y] arrays
    
    // Get a value between two boundaries
    function between (val, min, max) {
        val = Math.min(val, max);
        val = Math.max(val, min);
        return val;
    }

    /**
     * @class Ink.UI.Draggable
     * @version 1
     * @constructor
     * @param {String|DOMElement}   target                      Target element.
     * @param {Object}              [options]                   Optional object to configure the component.
     * @param {String}              [options.constraint]        Movement constraint. None by default. Can be `vertical`, `horizontal`, or `both`.
     * @param {String|DOMElement}   [options.constraintElm]     Constrain dragging to be within this element. None by default.
     * @param {Number}              [options.top]               Limits to constrain draggable movement.
     * @param {Number}              [options.right]             Limits to constrain draggable movement.
     * @param {Number}              [options.bottom]            Limits to constrain draggable movement.
     * @param {Number}              [options.left]              Limits to constrain draggable movement.
     * @param {String|DOMElement}   [options.handle]            If specified, this element or CSS ID will be used as a handle for dragging.
     * @param {Boolean}             [options.revert]            Flag to revert the draggable to the original position when dragging stops.
     * @param {String}              [options.cursor]            Cursor type (CSS `cursor` value) used when the mouse is over the draggable object.
     * @param {Number}              [options.zIndex]            Z-index applied to the draggable element while dragged.
     * @param {Number}              [options.fps]               If set, throttles the drag effect to this number of frames per second.
     * @param {DOMElement}          [options.droppableProxy]    If set, a shallow copy of this element will be moved around with transparent background.
     * @param {String}              [options.mouseAnchor]       Anchor for the drag. Can be one of: 'left','center','right','top','center','bottom'.
     * @param {String}              [options.dragClass]         Class to add when the draggable is being dragged. Defaults to drag.
     * @param {Function}            [options.onStart]           Callback called when dragging starts.
     * @param {Function}            [options.onEnd]             Callback called when dragging stops.
     * @param {Function}            [options.onDrag]            Callback called while dragging, prior to position updates.
     * @param {Function}            [options.onChange]          Callback called while dragging, after position updates.
     *
     * @sample Ink_UI_Draggable_1.html
     */
    var Draggable = function(element, options) {
        this.init(element, options);
    };

    Draggable.prototype = {

        /**
         * Init function called by the constructor
         * 
         * @method _init
         * @param {String|DOMElement}   element     Element ID of the element or DOM Element.
         * @param {Object}              [options]   Options object for configuration of the module.
         * @private
         */
        init: function(element, options) {
            var o = Ink.extendObj( {
                constraint:         false,
                constraintElm:      false,
                top:                false,
                right:              false,
                bottom:             false,
                left:               false,
                handle:             options.handler /* old option name */ || false,
                revert:             false,
                cursor:             'move',
                zindex:             options.zindex /* old option name */ || 9999,
                dragClass:          'drag',
                onStart:            false,
                onEnd:              false,
                onDrag:             false,
                onChange:           false,
                droppableProxy:     false,
                mouseAnchor:        undefined,
                skipChildren:       true,
                fps:                100,
                debug:              false
            }, options || {}, InkElement.data(element));

            this.options = o;
            this.element = Common.elOrSelector(element);
            this.constraintElm = o.constraintElm && Common.elOrSelector(o.constraintElm);

            this.handle             = false;
            this.elmStartPosition   = false;
            this.active             = false;
            this.dragged            = false;
            this.prevCoords         = false;
            this.placeholder        = false;

            this.position           = false;
            this.zindex             = false;
            this.firstDrag          = true;

            if (o.fps) {
                this.deltaMs = 1000 / o.fps;
                this.lastRunAt = 0;
            }

            this.handlers = {};
            this.handlers.start         = Ink.bindEvent(this._onStart,this);
            this.handlers.dragFacade    = Ink.bindEvent(this._onDragFacade,this);
            this.handlers.drag          = Ink.bindEvent(this._onDrag,this);
            this.handlers.end           = Ink.bindEvent(this._onEnd,this);
            this.handlers.selectStart   = function(event) {    InkEvent.stop(event);    return false;    };

            // set handle
            this.handle = (this.options.handle) ?
                Common.elOrSelector(this.options.handle) : this.element;
            this.handle.style.cursor = o.cursor;

            InkEvent.observe(this.handle, 'touchstart', this.handlers.start);
            InkEvent.observe(this.handle, 'mousedown', this.handlers.start);

            if (Browser.IE) {
                InkEvent.observe(this.element, 'selectstart', this.handlers.selectStart);
            }

            Common.registerInstance(this, this.element);
        },

        /**
         * Removes the ability of the element of being dragged
         * 
         * @method destroy
         * @public
         */
        destroy: function() {
            InkEvent.stopObserving(this.handle, 'touchstart', this.handlers.start);
            InkEvent.stopObserving(this.handle, 'mousedown', this.handlers.start);

            if (Browser.IE) {
                InkEvent.stopObserving(this.element, 'selectstart', this.handlers.selectStart);
            }
        },

        /**
         * Gets coordinates for a given event (with added page scroll)
         * 
         * @method _getCoords
         * @param {Object} e window.event object.
         * @return {Array} Array where the first position is the x coordinate, the second is the y coordinate
         * @private
         */
        _getCoords: function(e) {
            var ps = [InkElement.scrollWidth(), InkElement.scrollHeight()];
            return {
                x: (e.touches ? e.touches[0].clientX : e.clientX) + ps[x],
                y: (e.touches ? e.touches[0].clientY : e.clientY) + ps[y]
            };
        },

        /**
         * Clones src element's relevant properties to dst
         * 
         * @method _cloneStyle
         * @param {DOMElement} src Element from where we're getting the styles
         * @param {DOMElement} dst Element where we're placing the styles.
         * @private
         */
        _cloneStyle: function(src, dst) {
            dst.className = src.className;
            dst.style.borderWidth   = '0';
            dst.style.padding       = '0';
            dst.style.position      = 'absolute';
            dst.style.width         = InkElement.elementWidth(src)        + 'px';
            dst.style.height        = InkElement.elementHeight(src)    + 'px';
            dst.style.left          = InkElement.elementLeft(src)        + 'px';
            dst.style.top           = InkElement.elementTop(src)        + 'px';
            dst.style.cssFloat      = Css.getStyle(src, 'float');
            dst.style.display       = Css.getStyle(src, 'display');
        },

        /**
         * onStart event handler
         * 
         * @method _onStart
         * @param {Object} e window.event object
         * @return {Boolean|void} In some cases return false. Otherwise is void
         * @private
         */
        _onStart: function(e) {
            if (!this.active && InkEvent.isLeftClick(e) || typeof e.button === 'undefined') {

                var tgtEl = InkEvent.element(e);
                if (this.options.skipChildren && tgtEl !== this.handle) {    return;    }

                InkEvent.stop(e);

                Css.addClassName(this.element, this.options.dragClass);

                this.elmStartPosition = [
                    InkElement.elementLeft(this.element),
                    InkElement.elementTop( this.element)
                ];

                var pos = [
                    parseInt(Css.getStyle(this.element, 'left'), 10),
                    parseInt(Css.getStyle(this.element, 'top'),  10)
                ];

                var dims = InkElement.elementDimensions(this.element);

                this.originalPosition = [ pos[x] ? pos[x]: null, pos[y] ? pos[y] : null ];
                this.delta = this._getCoords(e); // mouse coords at beginning of drag

                this.active = true;
                this.position = Css.getStyle(this.element, 'position');
                this.zindex = Css.getStyle(this.element, 'zIndex');

                var div = document.createElement('div');
                div.style.position      = this.position;
                div.style.width         = dims[x] + 'px';
                div.style.height        = dims[y] + 'px';
                div.style.marginTop     = Css.getStyle(this.element, 'margin-top');
                div.style.marginBottom  = Css.getStyle(this.element, 'margin-bottom');
                div.style.marginLeft    = Css.getStyle(this.element, 'margin-left');
                div.style.marginRight   = Css.getStyle(this.element, 'margin-right');
                div.style.borderWidth   = '0';
                div.style.padding       = '0';
                div.style.cssFloat      = Css.getStyle(this.element, 'float');
                div.style.display       = Css.getStyle(this.element, 'display');
                div.style.visibility    = 'hidden';

                this.delta2 = [ this.delta.x - this.elmStartPosition[x], this.delta.y - this.elmStartPosition[y] ]; // diff between top-left corner of obj and mouse
                if (this.options.mouseAnchor) {
                    var parts = this.options.mouseAnchor.split(' ');
                    var ad = [dims[x], dims[y]];    // starts with 'right bottom'
                    if (parts[0] === 'left') {    ad[x] = 0;    } else if(parts[0] === 'center') {    ad[x] = parseInt(ad[x]/2, 10);    }
                    if (parts[1] === 'top') {     ad[y] = 0;    } else if(parts[1] === 'center') {    ad[y] = parseInt(ad[y]/2, 10);    }
                    this.applyDelta = [this.delta2[x] - ad[x], this.delta2[y] - ad[y]];
                }

                var dragHandlerName = this.options.fps ? 'dragFacade' : 'drag';

                this.placeholder = div;

                if (this.options.onStart) {        this.options.onStart(this.element, e);        }

                if (this.options.droppableProxy) {    // create new transparent div to optimize DOM traversal during drag
                    this.proxy = document.createElement('div');
                    dims = [
                        window.innerWidth     || document.documentElement.clientWidth   || document.body.clientWidth,
                        window.innerHeight    || document.documentElement.clientHeight  || document.body.clientHeight
                    ];
                    var fs = this.proxy.style;
                    fs.width            = dims[x] + 'px';
                    fs.height           = dims[y] + 'px';
                    fs.position         = 'fixed';
                    fs.left             = '0';
                    fs.top              = '0';
                    fs.zIndex           = this.options.zindex + 1;
                    fs.backgroundColor  = '#FF0000';
                    Css.setOpacity(this.proxy, 0);

                    var firstEl = document.body.firstChild;
                    while (firstEl && firstEl.nodeType !== 1) {    firstEl = firstEl.nextSibling;    }
                    document.body.insertBefore(this.proxy, firstEl);

                    
                    InkEvent.observe(this.proxy, 'mousemove', this.handlers[dragHandlerName]);
                    InkEvent.observe(this.proxy, 'touchmove', this.handlers[dragHandlerName]);
                }
                else {
                    InkEvent.observe(document, 'mousemove', this.handlers[dragHandlerName]);
                }

                this.element.style.position = 'absolute';
                this.element.style.zIndex = this.options.zindex;
                this.element.parentNode.insertBefore(this.placeholder, this.element);

                this._onDrag(e);

                InkEvent.observe(document, 'mouseup',      this.handlers.end);
                InkEvent.observe(document, 'touchend',     this.handlers.end);

                return false;
            }
        },

        /**
         * Function that gets the timestamp of the current run from time to time. (FPS)
         * 
         * @method _onDragFacade
         * @param {Object} window.event object.
         * @private
         */
        _onDragFacade: function(e) {
            var now = +new Date();
            if (!this.lastRunAt || now > this.lastRunAt + this.deltaMs) {
                this.lastRunAt = now;
                this._onDrag(e);
            }
        },

        /**
         * Function that handles the dragging movement
         * 
         * @method _onDrag
         * @param {Object} window.event object.
         * @private
         */
        _onDrag: function(e) {
            if (this.active) {
                InkEvent.stop(e);
                this.dragged = true;
                var mouseCoords = this._getCoords(e),
                    mPosX       = mouseCoords.x,
                    mPosY       = mouseCoords.y,
                    o           = this.options,
                    newX        = false,
                    newY        = false;

                if (this.prevCoords && mPosX !== this.prevCoords.x || mPosY !== this.prevCoords.y) {
                    if (o.onDrag) {        o.onDrag(this.element, e);        }
                    this.prevCoords = mouseCoords;

                    newX = this.elmStartPosition[x] + mPosX - this.delta.x;
                    newY = this.elmStartPosition[y] + mPosY - this.delta.y;

                    var draggableSize = InkElement.elementDimensions(this.element);

                    if (this.constraintElm) {
                        var offset = InkElement.offset(this.constraintElm);
                        var size = InkElement.elementDimensions(this.constraintElm);
                        var constTop = offset[y] + (o.top || 0),
                            constBottom = offset[y] + size[y] - (o.bottom || 0),
                            constLeft = offset[x] + (o.left || 0),
                            constRight = offset[x] + size[x] - (o.right || 0);

                        newY = between(newY, constTop, constBottom - draggableSize[y]);
                        newX = between(newX, constLeft, constRight - draggableSize[x]);
                    } else if (o.constraint) {
                        var right = o.right === false ? InkElement.pageWidth() - draggableSize[x] : o.right,
                            left = o.left === false ? 0 : o.left,
                            top = o.top === false ? 0 : o.top,
                            bottom = o.bottom === false ? InkElement.pageHeight() - draggableSize[y] : o.bottom;
                        if (o.constraint === 'horizontal' || o.constraint === 'both') {
                            newX = between(newX, left, right);
                        }
                        if (o.constraint === 'vertical' || o.constraint === 'both') {
                            newY = between(newY, top, bottom);
                        }
                    }

                    var Droppable = Ink.getModule('Ink.UI.Droppable_1');
                    if (this.firstDrag) {
                        if (Droppable) {    Droppable.updateAll();    }
                        /*this.element.style.position = 'absolute';
                        this.element.style.zIndex = this.options.zindex;
                        this.element.parentNode.insertBefore(this.placeholder, this.element);*/
                        this.firstDrag = false;
                    }

                    if (newX) {        this.element.style.left = newX + 'px';        }
                    if (newY) {        this.element.style.top  = newY + 'px';        }

                    if (Droppable) {
                        // apply applyDelta defined on drag init
                        var mouseCoords2 = this.options.mouseAnchor ?
                            {x: mPosX - this.applyDelta[x], y: mPosY - this.applyDelta[y]} :
                            mouseCoords;
                        Droppable.action(mouseCoords2, 'drag', e, this.element);
                    }
                    if (o.onChange) {    o.onChange(this);    }
                }
            }
        },

        /**
         * Function that handles the end of the dragging process
         * 
         * @method _onEnd
         * @param {Object} window.event object.
         * @private
         */
        _onEnd: function(e) {
            InkEvent.stopObserving(document, 'mousemove', this.handlers.drag);
            InkEvent.stopObserving(document, 'touchmove', this.handlers.drag);

            if (this.options.fps) {
                this._onDrag(e);
            }

            Css.removeClassName(this.element, this.options.dragClass);

            if (this.active && this.dragged) {

                if (this.options.droppableProxy) {    // remove transparent div...
                    document.body.removeChild(this.proxy);
                }

                if (this.pt) {    // remove debugging element...
                    InkElement.remove(this.pt);
                    this.pt = undefined;
                }

                /*if (this.options.revert) {
                    this.placeholder.parentNode.removeChild(this.placeholder);
                }*/

                if(this.placeholder) {
                    InkElement.remove(this.placeholder);
                }

                if (this.options.revert) {
                    this.element.style.position = this.position;
                    if (this.zindex !== null) {
                        this.element.style.zIndex = this.zindex;
                    }
                    else {
                        this.element.style.zIndex = 'auto';
                    } // restore default zindex of it had none

                    this.element.style.left = (this.originalPosition[x]) ? this.originalPosition[x] + 'px' : '';
                    this.element.style.top  = (this.originalPosition[y]) ? this.originalPosition[y] + 'px' : '';
                }

                if (this.options.onEnd) {
                    this.options.onEnd(this.element, e);
                }
                
                var Droppable = Ink.getModule('Ink.UI.Droppable_1');
                if (Droppable) {
                    Droppable.action(this._getCoords(e), 'drop', e, this.element);
                }

                this.position   = false;
                this.zindex     = false;
                this.firstDrag  = true;
            }

            this.active         = false;
            this.dragged        = false;
        }
    };

    return Draggable;

});

/**
 * Off-canvas menu
 * @module Ink.UI.Drawer_1
 * @version 1
 */
 
Ink.createModule('Ink.UI.Drawer', '1', ['Ink.UI.Common_1', 'Ink.Dom.Loaded_1', 'Ink.Dom.Selector_1', 'Ink.Dom.Element_1', 'Ink.Dom.Event_1', 'Ink.Dom.Css_1'], function(Common, Loaded, Selector, Element, Event, Css) {
    'use strict';

    function elNotFound(el) {
        Ink.warn( 'Ink.UI.Drawer_1: Could not find the "' +
            el + '" element on this page. Please make sure it exists.' );
    }

    function Drawer(options) {
        this._init(options);
    }

    Drawer.prototype = {
        /**
         * Displays off-canvas content which can be triggered by clicking elements with the 'left-drawer-trigger' and 'right-drawer-trigger', respectively.
         * The left drawer has the 'left-drawer' class, and the right drawer has the 'right-drawer' class. The content drawer (EG your `<div id="main">`) must have the 'content-drawer' class. For more, see the example below, or try the sample.
         * @class Ink.UI.Drawer_1
         * @constructor
         *
         * @param {Object}      [options]                       Configuration options.
         * @xparam {String}     [options.parentSelector]        The class you are using in your wrapper (in the example below, it's the `body` tag.
         * @xparam {String}     [options.leftDrawer]            Selector for the left drawer element. This element is placed outside the screen and shown when you click the `leftTrigger` element.
         * @xparam {String}     [options.leftTrigger]           Selector for the left drawer trigger(s). When you click this trigger, the `leftDrawer` is shown.
         * @xparam {String}     [options.rightDrawer]           Right drawer selector. (see `options.leftDrawer`)
         * @xparam {String}     [options.rightTrigger]          Right trigger selector (see `options.leftTrigger`)
         * @xparam {String}     [options.contentDrawer]         Selector for the content drawer.
         * @param {Boolean}     [options.closeOnContentClick]   Flag to close the drawer when someone clicks on the `.contentDrawer`
         * @param {String}      [options.mode]                  This can be 'push' or 'over'.
         * @param {String}      [options.sides]                 Can be 'left', 'right', or 'both'. Controls what sides have a drawer.
         *
         * @example
         * <body class="ink-drawer">
         *     <div class="left-drawer">
         *         Right drawer content...
         *     </div>
         *     <div class="right-drawer">
         *         Left drawer content...
         *     </div>
         *     <div id="main-content" class="content-drawer ink-grid">
         *         <a class="left-drawer-trigger" href="">Open left drawer</a>
         *         <a class="right-drawer-trigger" href="">Open right drawer</a>
         *         Content...
         *     </div>
         * </body>
         *
         * <script>
         *     Ink.requireModules(['Ink.UI.Drawer_1'], function (Drawer) {
         *         new Drawer();
         *     });
         * </script>
         */
        _init: function (options) {
            this._options = Common.options({
                parentSelector:     ['String', '.ink-drawer'],
                leftDrawer:         ['String', '.left-drawer'],
                leftTrigger:        ['String', '.left-drawer-trigger'],
                rightDrawer:        ['String', '.right-drawer'],
                rightTrigger:       ['String', '.right-drawer-trigger'],
                contentDrawer:      ['String', '.content-drawer'],
                closeOnContentClick: ['Boolean', true],
                closeOnLinkClick:    ['Boolean', true],
                mode:               ['String', 'push'],
                sides:              ['String', 'both']
            }, options || {});

            // make sure we have the required elements acording to the config options

            this._contentDrawers = Ink.ss(this._options.contentDrawer);

            this._leftDrawer = Ink.s(this._options.leftDrawer);
            this._leftTriggers = Ink.ss(this._options.leftTrigger);

            this._rightDrawer = Ink.s(this._options.rightDrawer);
            this._rightTriggers = Ink.ss(this._options.rightTrigger);

            // The body might not have it
            Css.addClassName(document.body, 'ink-drawer');

            if(this._contentDrawers.length === 0) {
                Ink.warn( 'Ink.UI.Drawer_1: Could not find any "' +
                    this._options.contentDrawer + '" elements on this page. ' +
                    'Please make sure you have at least one.' );
            }

            switch (this._options.sides) {
                case 'both':
                if( !this._leftDrawer ){
                    elNotFound(this._options.leftDrawer);
                }

                if(this._leftTriggers.length === 0){
                    elNotFound(this._options.leftTrigger);
                }

                if( !this._rightDrawer ){
                    elNotFound(this._options.rightDrawer);
                }

                if( this._rightTriggers.length === 0 ){
                    elNotFound(this._options.rightTrigger);
                }
                this._triggers = this._options.leftTrigger + ', ' + this._options.rightTrigger + ', ' + this._options.contentDrawer;
                break;

                case 'left':
                if( !this._leftDrawer ){
                    elNotFound(this._options.leftDrawer);
                }

                if(this._leftTriggers.length === 0){
                    elNotFound(this._options.leftTrigger);
                }
                this._triggers = this._options.leftTrigger + ', ' + this._options.contentDrawer;
                break;

                case 'right':
                if( !this._rightDrawer ){
                    elNotFound(this._options.rightDrawer);
                }

                if( this._rightTriggers.length === 0 ){
                    elNotFound(this._options.rightTrigger);
                }
                this._triggers = this._options.rightTrigger + ', ' + this._options.contentDrawer;
                break;
            }


            this._isOpen = false;
            this._direction = undefined;

            this._handlers = {
                click:     Ink.bindEvent(this._onClick, this),
                afterTransition: Ink.bindEvent(this._afterTransition, this)
            };
            this._delay = 10;
            this._addEvents();
        },

        /**
         * Click event handler.
         * Listens to the body's click event
         *
         * @method _onClick
         * @private
         **/
        _onClick: function(ev){
            var triggerClicked = Ink.bind(function (side) {
                // When clicking on the trigger, the corresponding side is toggled.
                if (this._isOpen) {
                    this.close();
                } else {
                    this.open(side);
                }
            }, this);

            if(Selector.matchesSelector(ev.currentTarget,this._options.leftTrigger)){
                // Clicked on the left trigger
                triggerClicked('left');
            } else if(Selector.matchesSelector(ev.currentTarget,this._options.rightTrigger)){
                triggerClicked('right');
            } else if(Selector.matchesSelector(ev.currentTarget,this._options.contentDrawer)){
                // Clicked on the rest of the body
                if(this._options.closeOnContentClick) {
                    this.close();
                }
            }

            // Clicked on a link
            if (this._options.closeOnLinkClick && Element.isLink(ev.target)) {
                this.close();
            }
        },

        _afterTransition: function(){
            if(!this._isOpen){
                if(this._direction === 'left') {
                    Css.removeClassName(this._leftDrawer, 'show');
                } else {
                    Css.removeClassName(this._rightDrawer, 'show');
                }
            }
        },

        _addEvents: function(){
            Event.on(document.body, 'click', this._triggers + ', a[href*="#"]', this._handlers.click);
        },

        open: function(direction) {
            this._isOpen = true;
            this._direction = direction;

            var open = direction === 'left' ?
                this._leftDrawer :
                this._rightDrawer;

            Css.addClassName(open,'show');
            setTimeout(Ink.bind(function(){
                Css.addClassName(document.body, [this._options.mode, direction]);
            },this), this._delay);
        },

        close: function() {
            if (this._isOpen === false) { return; }
            this._isOpen = false;
            // TODO detect transitionEnd exists, otherwise don't rely on it
            Event.one(document.body, 'transitionend oTransitionEnd transitionend webkitTransitionEnd', this._handlers.afterTransition);
            Css.removeClassName(document.body, [this._options.mode, this._direction]);
        }

    };

    return Drawer;
});

/**
 * Dropdown menus
 *
 * @module Ink.UI.Dropdown_1
 * Use this UI module to achieve a dropdown menu.
 *
 * @version 1
 */
 
Ink.createModule('Ink.UI.Dropdown', '1', ['Ink.UI.Common_1', 'Ink.UI.Toggle_1', 'Ink.Dom.Event_1', 'Ink.Dom.Element_1'], function(Common, Toggle, InkEvent, InkElement) {
    'use strict';

    function Dropdown(trigger, options) {
        this._init(trigger, options);
    }

    Dropdown.prototype = {
        /**
         * @class Ink.UI.Dropdown
         *
         * @constructor
         * @param {DOMElement|String}   trigger         Trigger Element
         * @param {Object}              options         Options Object
         * @param {DOMElement|String}   options.target Target of the dropdown action.
         *
         * @sample Ink_UI_Dropdown_1.html
         */
        _init: function(trigger, options) {
            this._element = Common.elOrSelector(trigger);
            this._options = Common.options('Ink.UI.Dropdown_1', {
                'target':           ['Element'],
                'hoverOpen':        ['Number', null],
                'dismissOnInsideClick': ['Boolean', false],
                'dismissOnOutsideClick': ['Boolean', true],
                'dismissAfter':     ['Number', null],
                'onInsideClick':    ['Function', null],
                'onOutsideClick':   ['Function', null],
                'onOpen':           ['Function', null],
                'onDismiss':        ['Function', null]
            }, options || {}, this._element);

            this._toggle = new Toggle(this._element, {
                target: this._options.target,
                closeOnInsideClick: null,
                closeOnClick: false,
                onChangeState: Ink.bind(function (newState) {
                    return this._openOrDismiss(newState, true, true);
                }, this)
            });

            // Event where we set this._dismissTimeout and clear this._openTimeout
            InkEvent.observeMulti([this._options.target, this._element],
                'mouseout', Ink.bindMethod(this, '_onMouseOut'));

            // Events to keep clearing this._dismissTimeout and set this._openTimeout
            InkEvent.observeMulti([this._options.target, this._element],
                'mouseover', Ink.bindMethod(this, '_onMouseOver'));

            // to call dismissOnInsideClick and onInsideClick
            InkEvent.observe(this._options.target, 'click', Ink.bindMethod(this, '_onInsideClick'));
            // to call dismissOnOutsideClick and onOutsideClick
            InkEvent.observe(document, 'click', Ink.bindMethod(this, '_onOutsideClick'));

            Common.registerInstance(this, this._element);
        },

        /**
         * Called when the mouse is over the toggler, or the dropdown.
         *
         * Deals with "hoverOpen" by setting the dropdown to open later. Also cancels "dismissAfter".
         * @method _onMouseOver
         * @private
         **/
        _onMouseOver: function () {
            if (typeof this._options.hoverOpen === 'number' && this._toggle.getState() === false) {
                clearTimeout(this._openTimeout);
                this._openTimeout = setTimeout(
                    Ink.bindMethod(this, 'open', true),
                    this._options.hoverOpen * 1000);
            }
            if (typeof this._options.dismissAfter === 'number') {
                clearTimeout(this._dismissTimeout);
            }
        },

        /**
         * Called when the mouse leaves either the toggler, or the dropdown.
         *
         * Deals with "dismissAfter" by setting the dropdown to be dismissed later. Also cancels "hoverOpen".
         * @method _onMouseOut
         * @private
         **/
        _onMouseOut: function () {
            if (typeof this._options.dismissAfter === 'number' && this._toggle.getState() === true) {
                clearTimeout(this._dismissTimeout);
                this._dismissTimeout = setTimeout(
                    Ink.bindMethod(this, 'dismiss', true),
                    this._options.dismissAfter * 1000);
            }
            if (typeof this._options.hoverOpen === 'number') {
                clearTimeout(this._openTimeout);
            }
        },

        /**
         * Handle clicks on the dropdown.
         * @method _onInsideClick
         * @private
         */
        _onInsideClick: function (event) {
            var ret = this._handlerCall('onInsideClick', InkEvent.element(event));
            if (ret === false) { return; }
            if (this._options.dismissOnInsideClick) {
                this.dismiss(true);
            }
        },

        /**
         * Handle clicks outside the dropdown.
         * @method _onOutsideClick
         * @private
         */
        _onOutsideClick: function (event) {
            var target = InkEvent.element(event);
            var foundElem = InkElement.findUpwardsHaving(target, Ink.bind(function (needle) {
                return needle === this._element;
            }, this));
            var foundTarget = InkElement.findUpwardsHaving(target, Ink.bind(function (needle) {
                return needle === this._options.target;
            }, this));

            if (!foundElem && !foundTarget) {
                var ret = this._handlerCall('onOutsideClick', target);
                if (ret === false) { return; }
                if (this._options.dismissOnOutsideClick) {
                    this.dismiss(true);
                }
            }
        },

        /**
         * Closes the dropdown.
         *
         * @method dismiss
         * @param [callHandler=false] call onDismiss handler
         */
        dismiss: function (callHandler, doNotInformToggle) {
            this._openOrDismiss(false, callHandler, doNotInformToggle);
        },

        /**
         * Opens the dropdown
         *
         * @method open
         * @param [callHandler=false] call onOpen handler
         */
        open: function (callHandler, _doNotInformToggle) {
            this._openOrDismiss(true, callHandler, _doNotInformToggle);
        },

        /**
         * DRY'ing up open() and dismiss()
         *
         * @method _openOrDismiss
         * @param [newState=false]
         * @param [callHandler=false]
         * @private
         */
        _openOrDismiss: function (newState, callHandler, _doNotInformToggle) {
            if (this._toggle && this._toggle.getState() === newState) { return; }
            if (callHandler) {
                if (this._handlerCall(newState ? 'onOpen' : 'onDismiss') === false) {
                    return false;  // canceled by event handler
                }
            }
            if (!_doNotInformToggle) {
                this._toggle.setState(newState);
            }
            clearTimeout(this._dismissTimeout);
            clearTimeout(this._openTimeout);
        },

        /**
         * call a method given by the user through the options
         *
         * @method _handlerCall
         * @param handler {String} The handler name in this._options
         * @param [args*] Arguments to pass to function
         */
        _handlerCall: function (handler/*, ... */) {
            if (this._options[handler]) {
                return this._options[handler].call(this, [].slice.call(arguments, 1));
            }
        }
    };

    return Dropdown;
});

/**
 * Drop elements around
 * @module Ink.UI.Droppable_1
 * @version 1
 */

Ink.createModule("Ink.UI.Droppable","1",["Ink.Dom.Element_1", "Ink.Dom.Event_1", "Ink.Dom.Css_1", "Ink.UI.Common_1", "Ink.Util.Array_1", "Ink.Dom.Selector_1"], function( InkElement, InkEvent, Css, Common, InkArray, Selector) {
    'use strict';

    // Higher order functions
    var hAddClassName = function (element) {
        return function (className) {return Css.addClassName(element, className);};
    };
    var hRemoveClassName = function (element) {
        return function (className) {return Css.removeClassName(element, className);};
    };

    /**
     * @namespace Ink.UI.Droppable
     * @version 1
     * @static
     */
    var Droppable = {
        /**
         * Flag to activate debug mode
         *
         * @property debug
         * @type {Boolean}
         * @private
         */
        debug: false,

        /**
         * Array with the data of each element (`{element: ..., data: ..., options: ...}`)
         * 
         * @property _droppables
         * @type {Array}
         * @private
         */
        _droppables: [],

        /**
         * Array of data for each draggable. (`{element: ..., data: ...}`)
         *
         * @property _draggables
         * @type {Array}
         * @private
         */
        _draggables: [],

        /**
         * Makes an element droppable.
         * This method adds it to the stack of droppable elements.
         * Can consider it a constructor of droppable elements, but where no Droppable object is returned.
         * 
         * In the following arguments, any events/callbacks you may pass, can be either functions or strings. If the 'move' or 'copy' strings are passed, the draggable gets moved into this droppable. If 'revert' is passed, an acceptable droppable is moved back to the element it came from.

         *
         * @method add
         * @param {String|DOMElement}   element                 Target element
         * @param {Object}              [options]               Options object
         * @param {String}              [options.hoverClass]    Classname(s) applied when an acceptable draggable element is hovering the element
         * @param {String}              [options.accept]        Selector for choosing draggables which can be dropped in this droppable.
         * @param {Function}            [options.onHover]       Callback when an acceptable draggable element is hovering the droppable. Gets the draggable and the droppable element as parameters.
         * @param {Function|String}     [options.onDrop]        Callback when an acceptable draggable element is dropped. Gets the draggable, the droppable and the event as parameters.
         * @param {Function|String}     [options.onDropOut]     Callback when a droppable is dropped outside this droppable. Gets the draggable, the droppable and the event as parameters. (see above for string options).
         * @public
         *
         * @sample Ink_UI_Droppable_1.html
         *
         */
        add: function(element, options) {
            element = Common.elOrSelector(element, 'Droppable.add target element');

            var opt = Ink.extendObj( {
                hoverClass:     options.hoverclass /* old name */ || false,
                accept:         false,
                onHover:        false,
                onDrop:         false,
                onDropOut:      false
            }, options || {}, InkElement.data(element));
            
            if (typeof opt.hoverClass === 'string') {
                opt.hoverClass = opt.hoverClass.split(/\s+/);
            }
            
            function cleanStyle(draggable) {
                draggable.style.position = 'inherit';
            }
            var that = this;
            var namedEventHandlers = {
                move: function (draggable, droppable/*, event*/) {
                    cleanStyle(draggable);
                    droppable.appendChild(draggable);
                },
                copy: function (draggable, droppable/*, event*/) {
                    cleanStyle(draggable);
                    droppable.appendChild(draggable.cloneNode);
                },
                revert: function (draggable/*, droppable, event*/) {
                    that._findDraggable(draggable).originalParent.appendChild(draggable);
                    cleanStyle(draggable);
                }
            };
            var name;

            if (typeof opt.onHover === 'string') {
                name = opt.onHover;
                opt.onHover = namedEventHandlers[name];
                if (opt.onHover === undefined) {
                    throw new Error('Unknown hover event handler: ' + name);
                }
            }
            if (typeof opt.onDrop === 'string') {
                name = opt.onDrop;
                opt.onDrop = namedEventHandlers[name];
                if (opt.onDrop === undefined) {
                    throw new Error('Unknown drop event handler: ' + name);
                }
            }
            if (typeof opt.onDropOut === 'string') {
                name = opt.onDropOut;
                opt.onDropOut = namedEventHandlers[name];
                if (opt.onDropOut === undefined) {
                    throw new Error('Unknown dropOut event handler: ' + name);
                }
            }

            var elementData = {
                element: element,
                data: {},
                options: opt
            };
            this._droppables.push(elementData);
            this._update(elementData);
        },
        
        /**
         * Finds droppable data about `element`. this data is added in `.add`
         *
         * @method _findData
         * @param {DOMElement} element  Needle
         * @return {object}             Droppable data of the element
         * @private
         */
        _findData: function (element) {
            var elms = this._droppables;
            for (var i = 0, len = elms.length; i < len; i++) {
                if (elms[i].element === element) {
                    return elms[i];
                }
            }
        },
        /**
         * Finds draggable data about `element`
         *
         * @method _findDraggable
         * @param {DOMElement} element  Needle
         * @return {Object}             Draggable data queried
         * @private
         */
        _findDraggable: function (element) {
            var elms = this._draggables;
            for (var i = 0, len = elms.length; i < len; i++) {
                if (elms[i].element === element) {
                    return elms[i];
                }
            }
        },

        /**
         * Invoke every time a drag starts
         * 
         * @method updateAll
         * @private
         */
        updateAll: function() {
            InkArray.each(this._droppables, Droppable._update);
        },

        /**
         * Updates location and size of droppable element
         * 
         * @method update
         * @param {String|DOMElement} element Target element
         * @public
         */
        update: function(element) {
            this._update(this._findData(element));
        },

        _update: function(elementData) {
            var data = elementData.data;
            var element = elementData.element;
            data.left   = InkElement.offsetLeft(element);
            data.top    = InkElement.offsetTop( element);
            data.right  = data.left + InkElement.elementWidth( element);
            data.bottom = data.top  + InkElement.elementHeight(element);
        },

        /**
         * Removes an element from the droppable stack and removes the droppable behavior
         * 
         * @method remove
         * @param {String|DOMElement} elOrSelector  Droppable element to disable.
         * @return {Boolean} Whether the object was found and deleted
         * @public
         */
        remove: function(el) {
            el = Common.elOrSelector(el);
            var len = this._droppables.length;
            for (var i = 0; i < len; i++) {
                if (this._droppables[i].element === el) {
                    this._droppables.splice(i, 1);
                    break;
                }
            }
            return len !== this._droppables.length;
        },

        /**
         * Executes an action on a droppable
         * 
         * @method action
         * @param {Object} coords       Coordinates where the action happened
         * @param {String} type         Type of action. 'drag' or 'drop'.
         * @param {Object} ev           Event object
         * @param {Object} draggable    Draggable element
         * @private
         */
        action: function(coords, type, ev, draggable) {
            // check all droppable elements
            InkArray.each(this._droppables, Ink.bind(function(elementData) {
                var data = elementData.data;
                var opt = elementData.options;
                var element = elementData.element;

                if (opt.accept && !Selector.matches(opt.accept, [draggable]).length) {
                    return;
                }

                if (type === 'drag' && !this._findDraggable(draggable)) {
                    this._draggables.push({
                        element: draggable,
                        originalParent: draggable.parentNode
                    });
                }

                // check if our draggable is over our droppable
                if (coords.x >= data.left && coords.x <= data.right &&
                        coords.y >= data.top && coords.y <= data.bottom) {
                    // INSIDE
                    if (type === 'drag') {
                        if (opt.hoverClass) {
                            InkArray.each(opt.hoverClass,
                                hAddClassName(element));
                        }
                        if (opt.onHover) {
                            opt.onHover(draggable, element);
                        }
                    } else if (type === 'drop') {
                        if (opt.hoverClass) {
                            InkArray.each(opt.hoverClass,
                                hRemoveClassName(element));
                        }
                        if (opt.onDrop) {
                            opt.onDrop(draggable, element, ev);
                        }
                    }
                } else {
                    // OUTSIDE

                    if (type === 'drag' && opt.hoverClass) {
                        InkArray.each(opt.hoverClass, hRemoveClassName(element));
                    } else if (type === 'drop') {
                        if(opt.onDropOut){
                            opt.onDropOut(draggable, element, ev);
                        }
                    }
                }
            }, this));
        }
    };

    return Droppable;
});

/**
 * Form Validation
 * @module Ink.UI.FormValidator_1
 * @version 1
 **/

Ink.createModule('Ink.UI.FormValidator', '1', ['Ink.Dom.Element_1', 'Ink.Dom.Css_1','Ink.Util.Validator_1','Ink.Dom.Selector_1'], function( InkElement, Css, InkValidator , Selector) {
    'use strict';

    function elementsWithSameName(elm) {
        if (!elm.name) { return []; }
        if (!elm.form) {
            return Selector.select('name="' + elm.name + '"');
        }
        var ret = elm.form[elm.name];
        if(typeof(ret.length) === 'undefined') {
            ret = [ret];
        }
        return ret;
    }
    /**
     * @namespace Ink.UI.FormValidator
     * @version 1
     */
    var FormValidator = {

        /**
         * Specifies the version of the component
         *
         * @property version
         * @type {String}
         * @readOnly
         * @public
         */
        version: '1',

        /**
         * Available flags to use in the validation process.
         * The keys are the 'rules', and their values are objects with the key 'msg', determining
         * what is the error message.
         *
         * @property _flagMap
         * @type {Object}
         * @readOnly
         * @private
         */
        _flagMap: {
            //'ink-fv-required': {msg: 'Campo obrigat&oacute;rio'},
            'ink-fv-required': {msg: 'Required field'},
            //'ink-fv-email': {msg: 'E-mail inv&aacute;lido'},
            'ink-fv-email': {msg: 'Invalid e-mail address'},
            //'ink-fv-url': {msg: 'URL inv&aacute;lido'},
            'ink-fv-url': {msg: 'Invalid URL'},
            //'ink-fv-number': {msg: 'N&uacute;mero inv&aacute;lido'},
            'ink-fv-number': {msg: 'Invalid number'},
            //'ink-fv-phone_pt': {msg: 'N&uacute;mero de telefone inv&aacute;lido'},
            'ink-fv-phone_pt': {msg: 'Invalid phone number'},
            //'ink-fv-phone_cv': {msg: 'N&uacute;mero de telefone inv&aacute;lido'},
            'ink-fv-phone_cv': {msg: 'Invalid phone number'},
            //'ink-fv-phone_mz': {msg: 'N&uacute;mero de telefone inv&aacute;lido'},
            'ink-fv-phone_mz': {msg: 'Invalid phone number'},
            //'ink-fv-phone_ao': {msg: 'N&uacute;mero de telefone inv&aacute;lido'},
            'ink-fv-phone_ao': {msg: 'Invalid phone number'},
            //'ink-fv-date': {msg: 'Data inv&aacute;lida'},
            'ink-fv-date': {msg: 'Invalid date'},
            //'ink-fv-confirm': {msg: 'Confirma&ccedil;&atilde;o inv&aacute;lida'},
            'ink-fv-confirm': {msg: 'Confirmation does not match'},
            'ink-fv-custom': {msg: ''}
        },

        /**
         * This property holds all form elements for later validation
         *
         * @property elements
         * @type {Object}
         * @public
         */
        elements: {},

        /**
         * This property holds the objects needed to cross-check for the 'confirm' rule
         *
         * @property confirmElms
         * @type {Object}
         * @public
         */
        confirmElms: {},

        /**
         * This property holds the previous elements in the confirmElms property, but with a
         * true/false specifying if it has the class ink-fv-confirm.
         *
         * @property hasConfirm
         * @type {Object}
         */
        hasConfirm: {},

        /**
         * Defined class name to use in error messages label
         *
         * @property _errorClassName
         * @type {String}
         * @readOnly
         * @private
         */
        _errorClassName: 'tip error',

        /**
         * @property _errorValidationClassName
         * @type {String}
         * @readOnly
         * @private
         */
        _errorValidationClassName: 'validaton',

        /**
         * @property _errorTypeWarningClassName
         * @type {String}
         * @readOnly
         * @private
         */
        _errorTypeWarningClassName: 'warning',

        /**
         * @property _errorTypeErrorClassName
         * @type {String}
         * @readOnly
         * @private
         */
        _errorTypeErrorClassName: 'error',

        /**
         * Checks if a form is valid
         * 
         * @method validate
         * @param {DOMElement|String}   elm                     DOM form element or form id
         * @param {Object}              options                 Configuration options
         * @param {Function}            [options.onSuccess]     Callback to run when form is valid
         * @param {Function}            [options.onError]       Callback to run when form is not valid
         * @param {Array}               [options.customFlag]    Custom flags to use to validate form fields
         * @public
         * @return {Boolean} Whether the form is deemed valid or not.
         *
         * @sample Ink_UI_FormValidator_1.html
         */
        validate: function(elm, options) {
            this._free();

            options = Ink.extendObj({
                onSuccess: false,
                onError: false,
                customFlag: false,
                confirmGroup: []
            }, options || {});

            if(typeof(elm) === 'string') {
                elm = document.getElementById(elm);
            }
            if(elm === null){
                return false;
            }
            this.element = elm;

            if(typeof(this.element.id) === 'undefined' || this.element.id === null || this.element.id === '') {
                // generate a random ID
                // TODO ugly and potentially problematic, and you know Murphy's law.
                this.element.id = 'ink-fv_randomid_'+(Math.round(Math.random() * 99999));
            }

            this.custom = options.customFlag;

            this.confirmGroup = options.confirmGroup;

            var fail = this._validateElements();

            if(fail.length > 0) {
                if(options.onError) {
                    options.onError(fail);
                } else {
                    this._showError(elm, fail);
                }
                return false;
            } else {
                if(!options.onError) {
                    this._clearError(elm);
                }
                this._clearCache();
                if(options.onSuccess) {
                    options.onSuccess();
                }
                return true;
            }

        },

        /**
         * Resets previously generated validation errors
         * 
         * @method reset
         * @public
         */
        reset: function()
        {
            this._clearError();
            this._clearCache();
        },

        /**
         * Cleans the object
         * 
         * @method _free
         * @private
         */
        _free: function()
        {
            this.element = null;
            //this.elements = [];
            this.custom = false;
            this.confirmGroup = false;
        },

        /**
         * Cleans the properties responsible for caching
         * 
         * @method _clearCache
         * @private
         */
        _clearCache: function()
        {
            this.element = null;
            this.elements = [];
            this.custom = false;
            this.confirmGroup = false;
        },

        /**
         * Gets the form elements and stores them in the caching properties
         * 
         * @method _getElements
         * @private
         */
        _getElements: function()
        {
            //this.elements = [];
            // if(typeof(this.elements[this.element.id]) !== 'undefined') {
            //     return;
            // }

            var elements = this.elements[this.element.id] = [];
            this.confirmElms[this.element.id] = [];
            //console.log(this.element);
            //console.log(this.element.elements);
            var formElms = Selector.select(':input', this.element);
            var curElm = false;
            for(var i=0, totalElm = formElms.length; i < totalElm; i++) {
                curElm = formElms[i];
                var type = (curElm.getAttribute('type') + '').toLowerCase();

                if (type === 'radio' || type === 'checkbox') {
                    if(elements.length === 0 ||
                            (
                             curElm.getAttribute('type') !== elements[elements.length - 1].getAttribute('type') &&
                            curElm.getAttribute('name') !== elements[elements.length - 1].getAttribute('name')
                            )) {
                        for(var flag in this._flagMap) {
                            if(Css.hasClassName(curElm, flag)) {
                                elements.push(curElm);
                                break;
                            }
                        }
                    }
                } else {
                    for(var flag2 in this._flagMap) {
                        if(Css.hasClassName(curElm, flag2) && flag2 !== 'ink-fv-confirm') {
                            /*if(flag2 == 'ink-fv-confirm') {
                                this.confirmElms[this.element.id].push(curElm);
                                this.hasConfirm[this.element.id] = true;
                            }*/
                            elements.push(curElm);
                            break;
                        }
                    }

                    if(Css.hasClassName(curElm, 'ink-fv-confirm')) {
                        this.confirmElms[this.element.id].push(curElm);
                        this.hasConfirm[this.element.id] = true;
                    }

                }
            }
        },

        /**
         * Runs the validation for each element
         * 
         * @method _validateElements
         * @private
         */
        _validateElements: function() {
            var oGroups;
            this._getElements();
            if(this.hasConfirm[this.element.id] === true) {
                oGroups = this._makeConfirmGroups();
            }

            var errors = [];

            var curElm = false;
            var customErrors = false;
            var inArray;
            for(var i=0, totalElm = this.elements[this.element.id].length; i < totalElm; i++) {
                inArray = false;
                curElm = this.elements[this.element.id][i];

                if(!curElm.disabled) {
                    for(var flag in this._flagMap) {
                        if(Css.hasClassName(curElm, flag)) {
                            if(flag !== 'ink-fv-custom' && flag !== 'ink-fv-confirm') {
                                if(!this._isValid(curElm, flag)) {
                                    if(!inArray) {
                                        errors.push({elm: curElm, errors:[flag]});
                                        inArray = true;
                                    } else {
                                        errors[(errors.length - 1)].errors.push(flag);
                                    }
                                }
                            } else if(flag !== 'ink-fv-confirm'){
                                customErrors = this._isCustomValid(curElm);
                                if(customErrors.length > 0) {
                                    errors.push({elm: curElm, errors:[flag], custom: customErrors});
                                }
                            } else if(flag === 'ink-fv-confirm'){
                                continue;
                            }
                        }
                    }
                }
            }
            errors = this._validateConfirmGroups(oGroups, errors);
            //console.log(InkDumper.returnDump(errors));
            return errors;
        },

        /**
         * Runs the 'confirm' validation for each group of elements
         * 
         * @method _validateConfirmGroups
         * @param {Array} oGroups Array/Object that contains the group of confirm objects
         * @param {Array} errors Array that will store the errors
         * @private
         * @return {Array} Array of errors that was passed as 2nd parameter (either changed, or not, depending if errors were found).
         */
        _validateConfirmGroups: function(oGroups, errors) {
            //console.log(oGroups);
            var curGroup = false;
            for(var i in oGroups) if (oGroups.hasOwnProperty(i)) {
                curGroup = oGroups[i];
                if(curGroup.length === 2) {
                    if(curGroup[0].value !== curGroup[1].value) {
                        errors.push({elm:curGroup[1], errors:['ink-fv-confirm']});
                    }
                }
            }
            return errors;
        },

        /**
         * Creates the groups of 'confirm' objects
         * 
         * @method _makeConfirmGroups
         * @private
         * @return {Array|Boolean} Returns the array of confirm elements or false on error.
         */
        _makeConfirmGroups: function()
        {
            var oGroups;
            if(this.confirmGroup && this.confirmGroup.length > 0) {
                oGroups = {};
                var curElm = false;
                var curGroup = false;
                //this.confirmElms[this.element.id];
                for(var i=0, total=this.confirmElms[this.element.id].length; i < total; i++) {
                    curElm = this.confirmElms[this.element.id][i];
                    for(var j=0, totalG=this.confirmGroup.length; j < totalG; j++) {
                        curGroup =  this.confirmGroup[j];
                        if(Css.hasClassName(curElm, curGroup)) {
                            if(typeof(oGroups[curGroup]) === 'undefined') {
                                oGroups[curGroup] = [curElm];
                            } else {
                                oGroups[curGroup].push(curElm);
                            }
                        }
                    }
                }
                return oGroups;
            } else {
                if(this.confirmElms[this.element.id].length === 2) {
                    oGroups = {
                        "ink-fv-confirm": [
                            this.confirmElms[this.element.id][0],
                            this.confirmElms[this.element.id][1]
                        ]
                    };
                }
                return oGroups;
            }
            return false;
        },

        /**
         * Validates an element with a custom validation
         * 
         * @method _isCustomValid
         * @param {DOMElemenmt} elm Element to be validated
         * @private
         * @return {Array} Array of errors. If no errors are found, results in an empty array.
         */
        _isCustomValid: function(elm)
        {
            var customErrors = [];
            var curFlag = false;
            for(var i=0, tCustom = this.custom.length; i < tCustom; i++) {
                curFlag = this.custom[i];
                if(Css.hasClassName(elm, curFlag.flag)) {
                    if(!curFlag.callback(elm, curFlag.msg)) {
                        customErrors.push({flag: curFlag.flag, msg: curFlag.msg});
                    }
                }
            }
            return customErrors;
        },

        /**
         * Runs the normal validation functions for a specific element
         * 
         * @method _isValid
         * @param {DOMElement} elm DOMElement that will be validated
         * @param {String} fieldType Rule to be validated. This must be one of the keys present in the _flagMap property.
         * @private
         * @return {Boolean} The result of the validation.
         */
        _isValid: function(elm, fieldType) {
            var nodeName = elm.nodeName.toLowerCase();
            var inputType = (elm.getAttribute('type') || '').toLowerCase();
            var value = this._trim(elm.value);

            // When we're analyzing emails, telephones, etc, and the field is
            // empty, we check if it is required. If not required, it's valid.
            if (fieldType !== 'ink-fv-required' &&
                    inputType !== 'checkbox' && inputType !== 'radio' &&
                    value === '') {
                return !Css.hasClassName(elm, 'ink-fv-required');
            }

            switch(fieldType) {
                case 'ink-fv-required':
                    if(nodeName === 'select') {
                        if(elm.selectedIndex > 0) {
                            return true;
                        } else {
                            return false;
                        }
                    }
                    if(inputType !== 'checkbox' && inputType !== 'radio' &&
                            value !== '') {
                        return true;  // A input type=text,email,etc.
                    } else if(inputType === 'checkbox' || inputType === 'radio') {
                        var aFormRadios = elementsWithSameName(elm);
                        var isChecked = false;
                        // check if any input of the radio is checked
                        for(var i=0, totalRadio = aFormRadios.length; i < totalRadio; i++) {
                            if(aFormRadios[i].checked === true) {
                                isChecked = true;
                                break;
                            }
                        }
                        return isChecked;
                    }
                    return false;

                case 'ink-fv-email':
                    return InkValidator.mail(elm.value);

                case 'ink-fv-url':
                    return InkValidator.url(elm.value);

                case 'ink-fv-number':
                    return !isNaN(Number(elm.value)) && isFinite(Number(elm.value));

                case 'ink-fv-phone_pt':
                    return InkValidator.isPTPhone(elm.value);

                case 'ink-fv-phone_cv':
                    return InkValidator.isCVPhone(elm.value);

                case 'ink-fv-phone_ao':
                    return InkValidator.isAOPhone(elm.value);

                case 'ink-fv-phone_mz':
                    return InkValidator.isMZPhone(elm.value);

                case 'ink-fv-date':
                    var Element = Ink.getModule('Ink.Dom.Element',1);
                    var dataset = Element.data( elm );
                    var validFormat = 'yyyy-mm-dd';

                    if( Css.hasClassName(elm, 'ink-datepicker') && ('format' in dataset) ){
                        validFormat = dataset.format;
                    } else if( ('validFormat' in dataset) ){
                        validFormat = dataset.validFormat;
                    }

                    if( !(validFormat in InkValidator._dateParsers ) ){
                        var validValues = [];
                        for( var val in InkValidator._dateParsers ){
                            if (InkValidator._dateParsers.hasOwnProperty(val)) {
                                validValues.push(val);
                            }
                        }
                        throw new Error(
                            'The attribute data-valid-format must be one of ' +
                            'the following values: ' + validValues.join(', '));
                    }
                    
                    return InkValidator.isDate( validFormat, elm.value );
                case 'ink-fv-custom':
                    break;
            }

            return false;
        },

        /**
         * Makes the necessary changes to the markup to show the errors of a given element
         * 
         * @method _showError
         * @param {DOMElement} formElm The form element to be changed to show the errors
         * @param {Array} aFail An array with the errors found.
         * @private
         */
        _showError: function(formElm, aFail) {
            this._clearError(formElm);

            //ink-warning-field

            //console.log(aFail);
            var curElm = false;
            for(var i=0, tFail = aFail.length; i < tFail; i++) {
                curElm = aFail[i].elm;
                if (curElm) {
                    this._showAnErrorOnElement(curElm, aFail[i]);
                }
            }
        },

        _showAnErrorOnElement: function (curElm, error) {
            /* jshint noempty:false */

            var controlGroupElm = InkElement.findUpwardsByClass(
                    curElm, 'control-group');
            var controlElm = InkElement.findUpwardsByClass(
                    curElm, 'control');

            var errorClasses = [
                this._errorClassName,
                this._errorTypeClassName].join(' ');

            var errorMsg = InkElement.create('p', {
                className: errorClasses
            });

            if(error.errors[0] !== 'ink-fv-custom') {
                errorMsg.innerHTML = this._flagMap[error.errors[0]].msg;
            } else {
                errorMsg.innerHTML = error.custom[0].msg;
            }

            var target = (controlElm || controlGroupElm);
            if (target) {
                target.appendChild(errorMsg);
            } else {
                InkElement.insertAfter(errorMsg, curElm);
            }

            if (controlElm) {
                if(error.errors[0] === 'ink-fv-required') {
                    Css.addClassName(controlGroupElm, 'validation error');
                } else {
                    Css.addClassName(controlGroupElm, 'validation warning');
                }
            }
        },

        /**
         * Clears the error of a given element. Normally executed before any validation, for all elements, as a reset.
         * 
         * @method _clearErrors
         * @param {DOMElement} formElm Form element to be cleared.
         * @private
         */
        _clearError: function(formElm) {
            //return;
            var aErrorLabel = formElm.getElementsByTagName('p');

            var curElm;
            var control;

            for(var i = (aErrorLabel.length - 1); i >= 0; i--) {
                curElm = aErrorLabel[i];
                if(Css.hasClassName(curElm, this._errorClassName)) {
                    control = InkElement.findUpwardsBySelector(curElm, '.control-group');
                    if (control) {
                        Css.removeClassName(control, ['validation', 'error', 'warning']);
                    }

                    if(Css.hasClassName(curElm, this._errorClassName, true /*both*/)) {
                        InkElement.remove(curElm);
                    }
                }
            }

            var aErrorLabel2 = formElm.getElementsByTagName('ul');
            for(i = (aErrorLabel2.length - 1); i >= 0; i--) {
                curElm = aErrorLabel2[i];
                if(Css.hasClassName(curElm, 'control-group')) {
                    Css.removeClassName(curElm, 'validation error');
                }
            }
        },

        /**
         * Removes unnecessary spaces to the left or right of a string
         * 
         * @method _trim
         * @param {String} stri String to be trimmed
         * @private
         * @return {String|undefined} String trimmed.
         */
        _trim: function(str)
        {
            if(typeof(str) === 'string')
            {
                return str.replace(/^\s+|\s+$|\n+$/g, '');
            }
        }
    };

    return FormValidator;

});
/**
 * Form Validation
 * @module Ink.UI.FormValidator_2
 * @version 2
 */

Ink.createModule('Ink.UI.FormValidator', '2', [ 'Ink.UI.Common_1','Ink.Dom.Element_1','Ink.Dom.Event_1','Ink.Dom.Selector_1','Ink.Dom.Css_1','Ink.Util.Array_1','Ink.Util.I18n_1','Ink.Util.Validator_1'], function( Common, Element, Event, Selector, Css, InkArray, I18n, InkValidator ) {
    'use strict';

    /**
     * Validation Functions to be used
     * Some functions are a port from PHP, others are the 'best' solutions available
     *
     * @private
     * @static
     */
    var validationFunctions = {

        /**
         * Checks if a value is defined and not empty
         * @method required
         * @param  {String} value Value to be checked
         * @return {Boolean}       True case is defined, false if it's empty or not defined.
         */
        'required': function( value ){
            return ( (typeof value !== 'undefined') && ( !(/^\s*$/).test(value) ) );
        },

        /**
         * Checks if a value has a minimum length
         *
         * @method min_length
         * @param  {String}         value   Value to be checked.
         * @param  {String|Number}  minSize Minimum number of characters.
         * @return {Boolean}                True if the length of value is equal or bigger than the minimum chars defined. False if not.
         */
        'min_length': function( value, minSize ){
            return ( (typeof value === 'string') && ( value.length >= parseInt(minSize,10) ) );
        },

        /**
         * Checks if a value has a maximum length
         *
         * @method max_length
         * @param  {String}         value   Value to be checked.
         * @param  {String|Number}  maxSize Maximum number of characters.
         * @return {Boolean}         True if the length of value is equal or smaller than the maximum chars defined. False if not.
         */
        'max_length': function( value, maxSize ){
            return ( (typeof value === 'string') && ( value.length <= parseInt(maxSize,10) ) );
        },

        /**
         * Checks if a value has an exact length
         *
         * @method exact_length
         * @param  {String}         value       Value to be checked
         * @param  {String|Number}  exactSize   Exact number of characters.
         * @return {Boolean}                    True if the length of value is equal to the size defined. False if not.
         */
        'exact_length': function( value, exactSize ){
            return ( (typeof value === 'string') && ( value.length === parseInt(exactSize,10) ) );
        },

        /**
         * Checks if a value is a valid email address
         *
         * @method email
         * @param  {String} value   Value to be checked
         * @return {Boolean}         True if the value is a valid email address. False if not.
         */
        'email': function( value ){
            return ( ( typeof value === 'string' ) && InkValidator.mail( value ) );
        },

        /**
         * Checks if a value has a valid URL
         *
         * @method url
         * @param  {String} value       Value to be checked
         * @param  {Boolean} fullCheck  Flag to validate a full url (with the protocol).
         * @return {Boolean}            True if the URL is considered valid. False if not.
         */
        'url': function( value, fullCheck ){
            fullCheck = fullCheck || false;
            return ( (typeof value === 'string') && InkValidator.url( value, fullCheck ) );
        },

        /**
         * Checks if a value is a valid IP. Supports ipv4 and ipv6
         *
         * @method ip
         * @param  {String} value   Value to be checked
         * @param  {String} ipType Type of IP to be validated. The values are: ipv4, ipv6. By default is ipv4.
         * @return {Boolean}         True if the value is a valid IP address. False if not.
         */
        'ip': function( value, ipType ){
            if( typeof value !== 'string' ){
                return false;
            }

            return InkValidator.isIP(value, ipType);
        },

        /**
         * Checks if a value is a valid phone number.
         * Supports several countries, based in the Ink.Util.Validator class.
         *
         * @method phone
         * @param  {String} value   Value to be checked
         * @param  {String} phoneType Country's initials to specify the type of phone number to be validated. Ex: 'AO'.
         * @return {Boolean}         True if it's a valid phone number. False if not.
         */
        'phone': function( value, phoneType ){
            if( typeof value !== 'string' ){
                return false;
            }

            var countryCode = phoneType ? phoneType.toUpperCase() : '';

            return InkValidator['is' + countryCode + 'Phone'](value);
        },

        /**
         * Checks if a value is a valid credit card.
         *
         * @method credit_card
         * @param  {String} value   Value to be checked
         * @param  {String} cardType Type of credit card to be validated. The card types available are in the Ink.Util.Validator class.
         * @return {Boolean}         True if the value is a valid credit card number. False if not.
         */
        'credit_card': function( value, cardType ){
            if( typeof value !== 'string' ){
                return false;
            }

            return InkValidator.isCreditCard( value, cardType || 'default' );
        },

        /**
         * Checks if a value is a valid date.
         *
         * @method date
         * @param  {String} value   Value to be checked
         * @param  {String} format Specific format of the date.
         * @return {Boolean}         True if the value is a valid date. False if not.
         */
        'date': function( value, format ){
            return ( (typeof value === 'string' ) && InkValidator.isDate(format, value) );
        },

        /**
         * Checks if a value only contains alphabetical values.
         *
         * @method alpha
         * @param  {String} value           Value to be checked
         * @param  {Boolean} supportSpaces  Allow whitespace
         * @return {Boolean}                True if the value is alphabetical-only. False if not.
         */
        'alpha': function( value, supportSpaces ){
            return InkValidator.ascii(value, {singleLineWhitespace: supportSpaces});
        },

        /*
         * Checks if a value contains only printable BMP unicode characters
         * Optionally allow punctuation and whitespace
         *
         * @method text
         * @param {String} value            Value to be checked
         * @return {Boolean}        Whether the value only contains printable text characters
         **/
        'text': function (value, whitespace, punctuation) {
            return InkValidator.unicode(value, {
                singleLineWhitespace: whitespace,
                unicodePunctuation: punctuation});
        },

        /*
         * Checks if a value contains only printable latin-1 text characters.
         * Optionally allow punctuation and whitespace.
         *
         * @method text
         * @param {String} value    Value to be checked
         * @return {Boolean}        Whether the value only contains printable text characters
         **/
        'latin': function (value, punctuation, whitespace) {
            if ( typeof value !== 'string') { return false; }
            return InkValidator.latin1(value, {latin1Punctuation: punctuation, singleLineWhitespace: whitespace});
        },

        /**
         * Checks if a value contains only alphabetical or numerical characters.
         *
         * @method alpha_numeric
         * @param  {String} value   Value to be checked
         * @return {Boolean}         True if the value is a valid alphanumerical. False if not.
         */
        'alpha_numeric': function( value ){
            return InkValidator.ascii(value, {numbers: true});
        },

        /**
         * Checks if a value contains only alphabetical, dash or underscore characteres.
         *
         * @method alpha_dashes
         * @param  {String} value   Value to be checked
         * @return {Boolean}         True if the value is a valid. False if not.
         */
        'alpha_dash': function( value ){
            return InkValidator.ascii(value, {dash: true, underscore: true});
        },

        /**
         * Checks if a value is a single digit.
         *
         * @method digit
         * @param  {String} value   Value to be checked
         * @return {Boolean}         True if the value is a valid digit. False if not.
         */
        'digit': function( value ){
            return ((typeof value === 'string') && /^[0-9]{1}$/.test(value));
        },

        /**
         * Checks if a value is a valid integer.
         *
         * @method integer
         * @param  {String} value   Value to be checked
         * @param  {String} positive Flag that specifies if the integer is must be positive (unsigned).
         * @return {Boolean}         True if the value is a valid integer. False if not.
         */
        'integer': function( value, positive ){
            return InkValidator.number(value, {
                negative: !positive,
                decimalPlaces: 0
            });
        },

        /**
         * Checks if a value is a valid decimal number.
         *
         * @method decimal
         * @param  {String} value   Value to be checked
         * @param  {String} decimalSeparator Character that splits the integer part from the decimal one. By default is '.'.
         * @param  {String} [decimalPlaces] Maximum number of digits that the decimal part must have.
         * @param  {String} [leftDigits] Maximum number of digits that the integer part must have, when provided.
         * @return {Boolean}         True if the value is a valid decimal number. False if not.
         */
        'decimal': function( value, decimalSeparator, decimalPlaces, leftDigits ){
            return InkValidator.number(value, {
                decimalSep: decimalSeparator || '.',
                decimalPlaces: +decimalPlaces || null,
                maxDigits: +leftDigits
            });
        },

        /**
         * Checks if a value is a numeric value.
         *
         * @method numeric
         * @param  {String} value               Value to be checked
         * @param  {String} decimalSeparator    Checks if it's a valid decimal. Otherwise checks if it's a valid integer.
         * @param  {String} [decimalPlaces]     Maximum number of digits the decimal part must have.
         * @param  {String} [leftDigits]        Maximum number of digits the integer part must have, when provided.
         * @return {Boolean}         True if the value is numeric. False if not.
         */
        'numeric': function( value, decimalSeparator, decimalPlaces, leftDigits ){
            decimalSeparator = decimalSeparator || '.';
            if( value.indexOf(decimalSeparator) !== -1  ){
                return validationFunctions.decimal( value, decimalSeparator, decimalPlaces, leftDigits );
            } else {
                return validationFunctions.integer( value );
            }
        },

        /**
         * Checks if a value is in a specific range of values.
         * The parameters after the first one are used to specify the range, and are similar in function to python's range() function.
         *
         * @method range
         * @param  {String} value           Value to be checked
         * @param  {String} minValue        Left limit of the range.
         * @param  {String} maxValue        Right limit of the range.
         * @param  {String} [multipleOf]    In case you want numbers that are only multiples of another number.
         * @return {Boolean}                True if the value is within the range. False if not.
         */
        'range': function( value, minValue, maxValue, multipleOf ){
            value = +value;
            minValue = +minValue;
            maxValue = +maxValue;

            if (isNaN(value) || isNaN(minValue) || isNaN(maxValue)) {
                return false;
            }

            if( value < minValue || value > maxValue ){
                return false;
            }

            if (multipleOf) {
                return (value - minValue) % multipleOf === 0;
            } else {
                return true;
            }
        },

        /**
         * Checks if a value is a valid color.
         *
         * @method color
         * @param  {String} value   Value to be checked
         * @return {Boolean}         True if the value is a valid color. False if not.
         */
        'color': function( value ){
            return InkValidator.isColor(value);
        },

        /**
         * Checks if a value matches the value of a different field.
         *
         * @method matches
         * @param  {String} value           Value to be checked
         * @param  {String} fieldToCompare  Name or ID of the field to compare.
         * @return {Boolean}         True if the values match. False if not.
         */
        'matches': function( value, fieldToCompare ){
            return ( value === this.getFormElements()[fieldToCompare][0].getValue() );
        }

    };

    /**
     * Error messages for the validation functions above
     * @private
     * @static
     */
    var validationMessages = new I18n({
        en_US: {
            'formvalidator.required' : 'The {field} filling is mandatory',
            'formvalidator.min_length': 'The {field} must have a minimum size of {param1} characters',
            'formvalidator.max_length': 'The {field} must have a maximum size of {param1} characters',
            'formvalidator.exact_length': 'The {field} must have an exact size of {param1} characters',
            'formvalidator.email': 'The {field} must have a valid e-mail address',
            'formvalidator.url': 'The {field} must have a valid URL',
            'formvalidator.ip': 'The {field} does not contain a valid {param1} IP address',
            'formvalidator.phone': 'The {field} does not contain a valid {param1} phone number',
            'formvalidator.credit_card': 'The {field} does not contain a valid {param1} credit card',
            'formvalidator.date': 'The {field} should contain a date in the {param1} format',
            'formvalidator.alpha': 'The {field} should only contain letters',
            'formvalidator.text': 'The {field} should only contain alphabetic characters',
            'formvalidator.latin': 'The {field} should only contain alphabetic characters',
            'formvalidator.alpha_numeric': 'The {field} should only contain letters or numbers',
            'formvalidator.alpha_dashes': 'The {field} should only contain letters or dashes',
            'formvalidator.digit': 'The {field} should only contain a digit',
            'formvalidator.integer': 'The {field} should only contain an integer',
            'formvalidator.decimal': 'The {field} should contain a valid decimal number',
            'formvalidator.numeric': 'The {field} should contain a number',
            'formvalidator.range': 'The {field} should contain a number between {param1} and {param2}',
            'formvalidator.color': 'The {field} should contain a valid color',
            'formvalidator.matches': 'The {field} should match the field {param1}',
            'formvalidator.validation_function_not_found': 'The rule {rule} has not been defined'
        },
        pt_PT: {
            'formvalidator.required' : 'Preencher {field} é obrigatório',
            'formvalidator.min_length': '{field} deve ter no mínimo {param1} caracteres',
            'formvalidator.max_length': '{field} tem um tamanho máximo de {param1} caracteres',
            'formvalidator.exact_length': '{field} devia ter exactamente {param1} caracteres',
            'formvalidator.email': '{field} deve ser um e-mail válido',
            'formvalidator.url': 'O {field} deve ser um URL válido',
            'formvalidator.ip': '{field} não tem um endereço IP {param1} válido',
            'formvalidator.phone': '{field} deve ser preenchido com um número de telefone {param1} válido.',
            'formvalidator.credit_card': '{field} não tem um cartão de crédito {param1} válido',
            'formvalidator.date': '{field} deve conter uma data no formato {param1}',
            'formvalidator.alpha': 'O campo {field} deve conter apenas caracteres alfabéticos',
            'formvalidator.text': 'O campo {field} deve conter apenas caracteres alfabéticos',
            'formvalidator.latin': 'O campo {field} deve conter apenas caracteres alfabéticos',
            'formvalidator.alpha_numeric': '{field} deve conter apenas letras e números',
            'formvalidator.alpha_dashes': '{field} deve conter apenas letras e traços',
            'formvalidator.digit': '{field} destina-se a ser preenchido com apenas um dígito',
            'formvalidator.integer': '{field} deve conter um número inteiro',
            'formvalidator.decimal': '{field} deve conter um número válido',
            'formvalidator.numeric': '{field} deve conter um número válido',
            'formvalidator.range': '{field} deve conter um número entre {param1} e {param2}',
            'formvalidator.color': '{field} deve conter uma cor válida',
            'formvalidator.matches': '{field} deve corresponder ao campo {param1}',
            'formvalidator.validation_function_not_found': '[A regra {rule} não foi definida]'
        }
    }, 'en_US');

    /**
     * Constructor of a FormElement.
     * This type of object has particular methods to parse rules and validate them in a specific DOM Element.
     *
     * @param  {DOMElement} element DOM Element
     * @param  {Object} options Object with configuration options
     * @return {FormElement} FormElement object
     */
    var FormElement = function( element, options ){
        this._element = Common.elOrSelector( element, 'Invalid FormElement' );
        this._errors = {};
        this._rules = {};
        this._value = null;

        this._options = Ink.extendObj( {
            label: this._getLabel()
        }, Element.data(this._element) );

        this._options = Ink.extendObj( this._options, options || {} );

    };

    /**
     * FormElement's prototype
     */
    FormElement.prototype = {

        /**
         * Function to get the label that identifies the field.
         * If it can't find one, it will use the name or the id
         * (depending on what is defined)
         *
         * @method _getLabel
         * @return {String} Label to be used in the error messages
         * @private
         */
        _getLabel: function(){

            var controlGroup = Element.findUpwardsByClass(this._element,'control-group');
            var label = Ink.s('label',controlGroup);
            if( label ){
                label = Element.textContent(label);
            } else {
                label = this._element.name || this._element.id || '';
            }

            return label;
        },

        /**
         * Function to parse a rules' string.
         * Ex: required|number|max_length[30]
         *
         * @method _parseRules
         * @param  {String} rules String with the rules
         * @private
         */
        _parseRules: function( rules ){
            this._rules = {};
            rules = rules.split("|");
            var i, rulesLength = rules.length, rule, params, paramStartPos ;
            if( rulesLength > 0 ){
                for( i = 0; i < rulesLength; i++ ){
                    rule = rules[i];
                    if( !rule ){
                        continue;
                    }

                    if( ( paramStartPos = rule.indexOf('[') ) !== -1 ){
                        params = rule.substr( paramStartPos+1 );
                        params = params.split(']');
                        params = params[0];
                        params = params.split(',');
                        for (var p = 0, len = params.length; p < len; p++) {
                            params[p] =
                                params[p] === 'true' ? true :
                                params[p] === 'false' ? false :
                                params[p];
                        }
                        params.splice(0,0,this.getValue());

                        rule = rule.substr(0,paramStartPos);

                        this._rules[rule] = params;
                    } else {
                        this._rules[rule] = [this.getValue()];
                    }
                }
            }
        },

        /**
         * Function to add an error to the FormElement's 'errors' object.
         * It basically receives the rule where the error occurred, the parameters passed to it (if any)
         * and the error message.
         * Then it replaces some tokens in the message for a more 'custom' reading
         *
         * @method _addError
         * @param  {String|null} rule    Rule that failed, or null if no rule was found.
         * @private
         * @static
         */
        _addError: function(rule){
            var params = this._rules[rule] || [];

            var paramObj = {
                field: this._options.label,
                value: this.getValue()
            };

            for( var i = 1; i < params.length; i++ ){
                paramObj['param' + i] = params[i];
            }

            var i18nKey = 'formvalidator.' + rule;

            this._errors[rule] = validationMessages.text(i18nKey, paramObj);

            if (this._errors[rule] === i18nKey) {
                this._errors[rule] = 'Validation message not found';
            }
        },

        /**
         * Gets an element's value
         *
         * @method getValue
         * @return {mixed} The DOM Element's value
         * @public
         */
        getValue: function(){

            switch(this._element.nodeName.toLowerCase()){
                case 'select':
                    return Ink.s('option:selected',this._element).value;
                case 'textarea':
                    return this._element.innerHTML;
                case 'input':
                    if( "type" in this._element ){
                        if( (this._element.type === 'radio') && (this._element.type === 'checkbox') ){
                            if( this._element.checked ){
                                return this._element.value;
                            }
                        } else if( this._element.type !== 'file' ){
                            return this._element.value;
                        }
                    } else {
                        return this._element.value;
                    }
                    return;
                default:
                    return this._element.innerHTML;
            }
        },

        /**
         * Gets the constructed errors' object.
         *
         * @method getErrors
         * @return {Object} Errors' object
         * @public
         */
        getErrors: function(){
            return this._errors;
        },

        /**
         * Gets the DOM element related to the instance.
         *
         * @method getElement
         * @return {Object} DOM Element
         * @public
         */
        getElement: function(){
            return this._element;
        },

        /**
         * Gets other elements in the same form.
         *
         * @method getFormElements
         * @return {Object} A mapping of keys to other elements in this form.
         * @public
         */
        getFormElements: function () {
            return this._options.form._formElements;
        },

        /**
         * Validates the element based on the rules defined.
         * It parses the rules defined in the _options.rules property.
         *
         * @method validate
         * @return {Boolean} True if every rule was valid. False if one fails.
         * @public
         */
        validate: function(){
            this._errors = {};

            if( "rules" in this._options || 1){
                this._parseRules( this._options.rules );
            }
            
            if( ("required" in this._rules) || (this.getValue() !== '') ){
                for(var rule in this._rules) {
                    if (this._rules.hasOwnProperty(rule)) {
                        if( (typeof validationFunctions[rule] === 'function') ){
                            if( validationFunctions[rule].apply(this, this._rules[rule] ) === false ){

                                this._addError( rule );
                                return false;

                            }

                        } else {

                            this._addError( null );
                            return false;
                        }
                    }
                }
            }

            return true;

        }
    };



    /**
     * @class Ink.UI.FormValidator_2
     * @version 2
     * @constructor
     * @param {String|DOMElement}   selector                        Either a CSS Selector string, or the form's DOMElement
     * @param {Object}              [options]                       Options object, containing the following options:
     * @param {String}              [options.eventTrigger]          Event that will trigger the validation. Defaults to 'submit'.
     * @param {Boolean}             [options.neverSubmit]           Flag to cancel the submit event. Use this to avoid submitting the form.
     * @param {Selector}            [options.searchFor]             Selector containing the validation data-attributes. Defaults to 'input, select, textarea, .control-group'.
     * @param {Function}            [options.beforeValidation]      Callback to be executed before validating the form
     * @param {Function}            [options.onError]               Validation error callback
     * @param {Function}            [options.onSuccess]             Validation success callback
     *
     * @sample Ink_UI_FormValidator_2.html
     */
    var FormValidator = function( selector, options ){

        /**
         * DOMElement of the form being validated
         *
         * @property _rootElement
         * @type {DOMElement}
         */
        this._rootElement = Common.elOrSelector( selector );

        /**
         * Object that will gather the form elements by name
         *
         * @property _formElements
         * @type {Object}
         */
        this._formElements = {};

        /**
         * Error message DOMElements
         * 
         * @property _errorMessages
         */
        this._errorMessages = [];

        /**
         * Array of elements marked with validation errors
         *
         * @property _markedErrorElements
         */
        this._markedErrorElements = [];

        /**
         * Configuration options. Fetches the data attributes first, then the ones passed when executing the constructor.
         * By doing that, the latter will be the one with highest priority.
         *
         * @property _options
         * @type {Object}
         */
        this._options = Ink.extendObj({
            eventTrigger: 'submit',
            neverSubmit: 'false',
            searchFor: 'input, select, textarea, .control-group',
            beforeValidation: undefined,
            onError: undefined,
            onSuccess: undefined
        },Element.data(this._rootElement));

        this._options = Ink.extendObj( this._options, options || {} );

        // Sets an event listener for a specific event in the form, if defined.
        // By default is the 'submit' event.
        if( typeof this._options.eventTrigger === 'string' ){
            Event.observe( this._rootElement,this._options.eventTrigger, Ink.bindEvent(this.validate,this) );
        }

        Common.registerInstance(this, this._rootElement);

        this._init();
    };

    /**
     * Sets or modifies validation functions
     *
     * @method setRule
     * @param {String}   name         Name of the function. E.g. 'required'
     * @param {String}   errorMessage Error message to be displayed in case of returning false. E.g. 'Oops, you passed {param1} as parameter1, lorem ipsum dolor...'
     * @param {Function} cb           Function to be executed when calling this rule
     * @public
     * @static
     */
    FormValidator.setRule = function( name, errorMessage, cb ){
        validationFunctions[ name ] = cb;
        if (validationMessages.getKey('formvalidator.' + name) !== errorMessage) {
            var langObj = {}; langObj['formvalidator.' + name] = errorMessage;
            var dictObj = {}; dictObj[validationMessages.lang()] = langObj;
            validationMessages.append(dictObj);
        }
    };

    /**
     * Gets the i18n object in charge of the error messages
     *
     * @method getI18n
     * @return {Ink.Util.I18n} The i18n object the FormValidator is using.
     */
    FormValidator.getI18n = function () {
        return validationMessages;
    };

    /**
     * Sets the I18n object for validation error messages
     *
     * @method setI18n
     * @param {Ink.Util.I18n} i18n  The I18n object.
     */
    FormValidator.setI18n = function (i18n) {
        validationMessages = i18n;
    };

   /**
     * Add to the I18n dictionary.
     * See `Ink.Util.I18n.append()` documentation.
     *
     * @method AppendI18n
     */
    FormValidator.appendI18n = function () {
        validationMessages.append.apply(validationMessages, [].slice.call(arguments));
    };

    /**
     * Sets the language of the error messages.
     * pt_PT and en_US are available, but you can add new languages by using append()
     *
     * See the `Ink.Util.I18n.lang()` setter
     *
     * @method setLanguage
     * @param language  The language to set i18n to.
     */
    FormValidator.setLanguage = function (language) {
        validationMessages.lang(language);
    };

    /**
     * Method used to get the existing defined validation functions
     *
     * @method getRules
     * @return {Object} Object with the rules defined
     * @public
     * @static
     */
    FormValidator.getRules = function(){
        return validationFunctions;
    };

    FormValidator.prototype = {
        _init: function(){

        },

        /**
         * Searches for the elements in the form.
         * This method is based in the this._options.searchFor configuration.
         *
         * @method getElements
         * @return {Object} An object with the elements in the form, indexed by name/id
         * @public
         */
        getElements: function(){
            this._formElements = {};
            var formElements = Selector.select( this._options.searchFor, this._rootElement );
            if( formElements.length ){
                var i, element;
                for( i=0; i<formElements.length; i+=1 ){
                    element = formElements[i];

                    var dataAttrs = Element.data( element );

                    if( !("rules" in dataAttrs) ){
                        continue;
                    }

                    var options = {
                        form: this
                    };

                    var key;
                    if( ("name" in element) && element.name ){
                        key = element.name;
                    } else if( ("id" in element) && element.id ){
                        key = element.id;
                    } else {
                        key = 'element_' + Math.floor(Math.random()*100);
                        element.id = key;
                    }

                    if( !(key in this._formElements) ){
                        this._formElements[key] = [ new FormElement( element, options ) ];
                    } else {
                        this._formElements[key].push( new FormElement( element, options ) );
                    }
                }
            }

            return this._formElements;
        },

        /**
         * Validates every registered FormElement 
         * This method looks inside the this._formElements object for validation targets.
         * Also, based on the this._options.beforeValidation, this._options.onError, and this._options.onSuccess, this callbacks are executed when defined.
         *
         * @method validate
         * @param  {Event} event    Window.event object
         * @return {Boolean}
         * @public
         */
        validate: function( event ) {

            if(this._options.neverSubmit+'' === 'true' && event) {
                Event.stopDefault(event);
            }

            if( typeof this._options.beforeValidation === 'function' ){
                this._options.beforeValidation();
            }

            InkArray.each( this._markedErrorElements, function (errorElement) {
                Css.removeClassName(errorElement,  ['validation', 'error']);
            });
            InkArray.each( this._errorMessages, Element.remove);

            this.getElements();
            var errorElements = [];

            for( var key in this._formElements ){
                if( this._formElements.hasOwnProperty(key) ){
                    for( var counter = 0; counter < this._formElements[key].length; counter+=1 ){
                        if( !this._formElements[key][counter].validate() ) {
                            errorElements.push(this._formElements[key][counter]);
                        }
                    }
                }
            }
            
            if( errorElements.length === 0 ){
                if( typeof this._options.onSuccess === 'function' ){
                    this._options.onSuccess();
                }

                // [3.0.0] remove this, it's a little backwards compat quirk
                if(event && this._options.cancelEventOnSuccess.toString() === 'true') {
                    Event.stopDefault(event);
                    return false;
                }

                return true;
            } else {

                if(event) {
                    Event.stopDefault(event);
                }

                if( typeof this._options.onError === 'function' ){
                    this._options.onError( errorElements );
                }
                this._errorMessages = [];
                this._markedErrorElements = [];

                InkArray.each( errorElements, Ink.bind(function( formElement ){
                    var controlGroupElement;
                    var controlElement;
                    if( Css.hasClassName(formElement.getElement(),'control-group') ){
                        controlGroupElement = formElement.getElement();
                        controlElement = Ink.s('.control',formElement.getElement());
                    } else {
                        controlGroupElement = Element.findUpwardsByClass(formElement.getElement(),'control-group');
                        controlElement = Element.findUpwardsByClass(formElement.getElement(),'control');
                    }

                    if(controlGroupElement) {
                        Css.addClassName( controlGroupElement, ['validation', 'error'] );
                        this._markedErrorElements.push(controlGroupElement);
                    }

                    var paragraph = document.createElement('p');
                    Css.addClassName(paragraph,'tip');
                    if (controlElement || controlGroupElement) {
                        (controlElement || controlGroupElement).appendChild(paragraph);
                    } else {
                        Element.insertAfter(paragraph, formElement.getElement());
                    }

                    var errors = formElement.getErrors();
                    var errorArr = [];
                    for (var k in errors) {
                        if (errors.hasOwnProperty(k)) {
                            errorArr.push(errors[k]);
                        }
                    }
                    paragraph.innerHTML = errorArr.join('<br/>');
                    this._errorMessages.push(paragraph);
                }, this));
                return false;
            }
        }
    };

    /**
     * Returns the FormValidator's Object
     */
    return FormValidator;

});

/**
 * Responsive image loading
 * @module Ink.UI.ImageQuery_1
 * @version 1
 */
 
Ink.createModule('Ink.UI.ImageQuery', '1', ['Ink.UI.Common_1','Ink.Dom.Event_1','Ink.Dom.Element_1','Ink.Util.Array_1'], function(Common, Event, Element, InkArray ) {
    'use strict';

    /**
     * @class Ink.UI.ImageQuery
     * @constructor
     * @version 1
     *
     * @param {String|DOMElement}   selector                    Selector or element
     * @param {Object}              [options]                   Options object
     * @param {String|Function}     [options.src]               String or Callback function (that returns a string) with the path to be used to get the images.
     * @param {String|Function}     [options.retina]            String or Callback function (that returns a string) with the path to be used to get RETINA specific images.
     * @param {Array}               [options.queries]           Array of queries
     * @param {String}              [options.queries.label]     Label of the query. Ex. 'small'
     * @param {Number}              [options.queries.width]     Min-width to use this query
     * @param {Function}            [options.onLoad]            Date format string
     *
     * @example
     *      <div class="imageQueryExample all-100 content-center clearfix vspace">
     *          <img src="/assets/imgs/imagequery/small/image.jpg" />
     *      </div>
     *      <script type="text/javascript">
     *      Ink.requireModules( ['Ink.Dom.Selector_1', 'Ink.UI.ImageQuery_1'], function( Selector, ImageQuery ){
     *          var imageQueryElement = Ink.s('.imageQueryExample img');
     *          var imageQueryObj = new ImageQuery('.imageQueryExample img',{
     *              src: '/assets/imgs/imagequery/{:label}/{:file}',
     *              queries: [
     *                  {
     *                      label: 'small',
     *                      width: 480
     *                  },
     *                  {
     *                      label: 'medium',
     *                      width: 640
     *                  },
     *                  {
     *                      label: 'large',
     *                      width: 1024
     *                  }   
     *              ]
     *          });
     *      } );
     *      </script>
     */
    var ImageQuery = function(selector, options){

        /**
         * Get elements, create more ImageQueries if selector finds more than one
         *
         * [improvement] This is a useful pattern. More UI modules could use it.
         */
        this._element = Common.elsOrSelector(selector, 'Ink.UI.ImageQuery', /*required=*/true);

        // In case we have several elements
        for (var i = 1 /* start from second element*/; i < this._element.length; i++) {
            new ImageQuery(this._element[i], options);
        }

        this._element = this._element[0];

        /**
         * Default options, overriden by data-attributes if any.
         * The parameters are:
         * @xparam {array} queries Array of objects that determine the label/name and its min-width to be applied.
         * @xparam {boolean} allowFirstLoad Boolean flag to allow the loading of the first element.
         */
        this._options = Ink.extendObj({
            queries:[],
            onLoad: null
        }, options || {}, Element.data(this._element));

        /**
         * Determining the original basename (with the querystring) of the file.
         */
        var pos;
        if( (pos=this._element.src.lastIndexOf('?')) !== -1 ){
            var search = this._element.src.substr(pos);
            this._filename = this._element.src.replace(search,'').split('/').pop()+search;
        } else {
            this._filename = this._element.src.split('/').pop();
        }

        this._init();
    };

    ImageQuery.prototype = {

        /**
         * Init function called by the constructor
         * 
         * @method _init
         * @private
         */
        _init: function(){
            // Sort queries by width, in descendant order.
            this._options.queries = InkArray.sortMulti(this._options.queries, 'width').reverse();

            if( typeof this._options.onLoad === 'function' ){
                Event.observe(this._element, 'onload', Ink.bindEvent(this._onLoad, this));
            }

            Event.observe(window, 'resize', Event.throttle(Ink.bindMethod(this, '_onResize'), 400));

            // Imediate call to apply the right images based on the current viewport
            this._onResize();

            Common.registerInstance(this, this._element);
        },

        /**
         * Handles the resize event (as specified in the _init function)
         *
         * @method _onResize
         * @private
         */
        _onResize: function(){
            if( !this._options.queries.length ){
                return;
            }

            var current = this._findCurrentQuery();

            /**
             * Choosing the right src. The rule is:
             *
             *   "If there is specifically defined in the query object, use that. Otherwise uses the global src."
             *
             * The above rule applies to a retina src.
             */
            var src = current.src || this._options.src;
            if ( window.devicePixelRatio > 1 && ('retina' in this._options ) ) {
                src = current.retina || this._options.retina;
            }

            /**
             * Injects the file variable for usage in the 'templating system' below
             */
            current.file = this._filename;

            /**
             * Since we allow the src to be a callback, let's run it and get the results.
             * For the inside, we're passing the element (img) being processed and the object of the selected query.
             */
            if( typeof src === 'function' ){
                src = src.apply(this,[this._element,current]);
                if( typeof src !== 'string' ){
                    throw '[ImageQuery] :: "src" callback does not return a string';
                }
            }

            /**
             * Replace the values of the existing properties on the query object (except src and retina) in the
             * defined src and/or retina.
             */
            src = src.replace(/{:(.*?)}/g, function(_, prop) {
                return current[prop];
            });

            this._element.src = src;

            // Removes the injected file property
            delete current.file;
        },

        /**
         * Queries are in a descendant order. We want to find the query with the highest width that fits the viewport, therefore the first one.
         */
        _findCurrentQuery: function () {
            /**
             * Gets viewport width
             */
            var viewportWidth = window.innerWidth ||
                document.documentElement.clientWidth ||
                document.body.clientWidth;

            var queries = this._options.queries;
            var last = queries.length - 1;

            for( var query=0; query < last; query+=1 ){
                if (queries[query].width <= viewportWidth){
                    return queries[query];
                }
            }

            return queries[last];
        },

        /**
         * Handles the element loading (img onload) event
         *
         * @method _onLoad
         * @private
         */
        _onLoad: function(){

            /**
             * Since we allow a callback for this let's run it.
             */
            this._options.onLoad.call(this);
        }

    };

    return ImageQuery;

});

/**
 * Delays content loading
 * @module Ink.UI.LazyLoad_1
 * @version 1
 */

Ink.createModule('Ink.UI.LazyLoad', '1', ['Ink.UI.Common_1', 'Ink.Dom.Event_1', 'Ink.Dom.Element_1'], function(Common, InkEvent, InkElement) {
'use strict';

var LazyLoad = function(selector, options) {
    this._init(selector, options);
};

LazyLoad.prototype = {
    /**
     * Stops the browser from loading a barrage of content at once.
     *
     * This delays the loading of images and other content until the corresponding elements are visible in the browser viewport.
     * This was created to load images later, but can be also used for widgets which are slow to load and are only useful when on screen.
     *
     * This works through copying the `src` attribute into `data-src`, and placing a `placeholder` string in the `src` attribute. Then, when the element is on screen, the `data-src` attribute is copied back to `src` and the content starts loading. You can use the options below to change what attributes are involved in the exchange.
     *
     * You can also provide your `onInsideViewport` callback and use it to start widgets which need javascript, such as an interactive map or an animation.
     *
     * @class Ink.UI.LazyLoad_1
     * @constructor
     *
     * @param rootElement {String|DOMElement} The element which contains the lazily-loaded items.
     * @param {Object}      [options]                           Options object, containing:
     * @param {String}      [options.item]                      Item selector. Defaults to '.lazyload-item'.
     * @param {String}      [options.placeholder]               Placeholder value for items which are not 'visible', in case they don't already have a value set.
     * @param {String}      [options.source]                    Source attribute. When an item is 'visible', use this attribute's value to set its destination attribute. Defaults to 'data-src'.
     * @param {String}      [options.destination]               Destination attribute. Attribute to change when the element is 'visible'. Defaults to 'src'. 
     * @param {Number}      [options.delay]                     Milliseconds to wait before trying to load items. Defaults to 100.
     * @param {Number}      [options.delta]                     Offset distance in pixels. Determines how far the top of an item must be from the viewport be considered 'visible'. Negative values shrink the considered 'visible' viewport while positive values enlarge it. Defaults to 0.
     * @param {Boolean}     [options.image]                     Set to false to make this component do nothing to any elements and just give you the onInsideViewport callback.
     * @param {DOMElement}  [options.scrollElement]             (advanced) What element is to be listened for the scroll event. Defaults to document.window.
     * @param {Boolean}     [options.touchEvents]               Subscribe to touch events in addition to scroll events. Useful in mobile safari because 'scroll' events aren't frequent enough. Defaults to true.
     * @param {Function}    [options.onInsideViewport]          Callback function for when an `item` is 'visible'. Receives an object containing the item's element as an argument.
     * @param {Function}    [options.onAfterAttributeChange]    (advanced) Callback function when an item's attribute changes. Receives an object containing the item's element as an argument.
     * @param {Boolean}     [options.autoInit]                  (advanced) Set to false if you want to start LazyLoad yourself with `reload()`. Defaults to true.
     *
     * @sample Ink_UI_LazyLoad_1.html
     */
    _init: function(selector) {
        this._rootElm = Common.elsOrSelector(selector, 'Ink.UI.LazyLoad root element')[0] || null;

        this._options = Common.options({
            item: ['String', '.lazyload-item'],
            placeholder: ['String', null],
            source: ['String', 'data-src'],
            destination: ['String', 'src'],
            delay: ['Number', 100],
            delta: ['Number', 0],
            image: ['Boolean', true],
            scrollElement: ['Element', window],
            touchEvents: ['Boolean', true],
            onInsideViewport: ['Function', false],
            onAfterAttributeChange: ['Function', false],
            autoInit: ['Boolean', true]
        }, arguments[1] || {}, this._rootElm);

        this._aData = [];
        this._hasEvents = false;
   
        if(this._options.autoInit) {
            this._activate();
        }

        Common.registerInstance(this, this._rootElm);
    },

    _activate: function() 
    {
        this._getData();
        if(!this._hasEvents) {
            this._addEvents(); 
        }
        this._onScrollThrottled();
    },

    _getData: function()
    {
        var aElms = Ink.ss(this._options.item);
        var attr = null;
        for(var i=0, t=aElms.length; i < t; i++) {
            if (this._options.placeholder != null && !InkElement.hasAttribute(aElms[i], this._options.destination)) {
                aElms[i].setAttribute(this._options.destination, this._options.placeholder);
            }
            attr = aElms[i].getAttribute(this._options.source);
            if(attr !== null || !this._options.image) {
                this._aData.push({elm: aElms[i], original: attr});
            }
        }
    },

    _addEvents: function() 
    {
        this._onScrollThrottled = InkEvent.throttle(Ink.bindEvent(this._onScroll, this), this._options.delay);
        if('ontouchmove' in document.documentElement && this._options.touchEvents) {
            InkEvent.observe(document.documentElement, 'touchmove', this._onScrollThrottled);
        }
        InkEvent.observe(this._options.scrollElement, 'scroll', this._onScrollThrottled);
        this._hasEvents = true;
    },

    _removeEvents: function() {
        if('ontouchmove' in document.documentElement && this._options.touchEvents) {
            InkEvent.stopObserving(document.documentElement, 'touchmove', this._onScrollThrottled);
        }
        InkEvent.stopObserving(this._options.scrollElement, 'scroll', this._onScrollThrottled);
        this._hasEvents = false;
    }, 

    _onScroll: function() {
        var curElm;

        for(var i=0; i < this._aData.length; i++) {
            curElm = this._aData[i];

            if(InkElement.inViewport(curElm.elm, { partial: true, margin: this._options.delta })) {
                this._elInViewport(curElm);
                if (this._options.image) {
                    /* [todo] a seemingly unrelated option creates a branch? Some of this belongs in another module. */
                    this._aData.splice(i, 1);
                    i -= 1;
                }
            }
        }

        if (this._aData.length === 0) {
            this._removeEvents();
        }
    },

    /**
     * Called when an element is detected inside the viewport
     *
     * @method _elInViewport
     * @param {LazyLoadInternalElementData} curElm
     * @private
     **/
    _elInViewport: function (curElm) {
        this._userCallback('onInsideViewport', { element: curElm.elm });

        if(this._options.image) {
            curElm.elm.setAttribute(this._options.destination, curElm.original);
            curElm.elm.removeAttribute(this._options.source);
        }

        this._userCallback('onAfterAttributeChange', { element: curElm.elm });
    },

    /**
     * Call a callback if it exists and its `typeof` is `"function"`.
     * @method _userCallback
     * @param name {String} Callback name in this._options.
     * @private
     **/
    _userCallback: function (name) {
        if (typeof this._options[name] === 'function') {
            this._options[name].apply(this, [].slice.call(arguments, 1));
        }
    },

    /**
     * Load or reload the component.
     * Adding the 'scroll' event listener if necessary and checks if anything needs to be loaded now.
     *
     * You can use this to manually invoke the loading logic without user action. 
     *
     * @method reload
     * @public
     */
    reload: function() {
        this._activate(); 
    },

    /**
     * Destroy this component
     * @method destroy
     * @public
     **/
    destroy: function() {
        if(this._hasEvents) {
            this._removeEvents();
        }
        Common.destroyComponent.call(this);
    }
};

return LazyLoad;

});

/**
 * Modal dialog prompts
 * @module Ink.UI.Modal_1
 * @version 1
 */
Ink.createModule('Ink.UI.Modal', '1', ['Ink.UI.Common_1','Ink.Dom.Event_1','Ink.Dom.Css_1','Ink.Dom.Element_1','Ink.Dom.Selector_1','Ink.Util.Array_1'], function(Common, Event, Css, InkElement, Selector, InkArray ) {
    'use strict';

    var opacitySupported = (function (div) {
        div.style.opacity = 'invalid';
        return div.style.opacity !== 'invalid';
    }(InkElement.create('div', {style: 'opacity: 1'})));

    /**
     * @class Ink.UI.Modal
     * @constructor
     * @version 1
     * @param {String|DOMElement}   selector                        Element or ID
     * @param {Object}              [options]                       Options object, containing:
     * @param {String}              [options.width]                 Default/Initial width. Ex: '600px'
     * @param {String}              [options.height]                Default/Initial height. Ex: '400px'
     * @param {String}              [options.shadeClass]            Custom class to be added to the div.ink-shade
     * @param {String}              [options.modalClass]            Custom class to be added to the div.ink-modal
     * @param {String}              [options.trigger]               CSS Selector for target elements that will trigger the Modal.
     * @param {Boolean}             [options.autoDisplay]           Displays the Modal automatically when constructed.
     * @param {String}              [options.markup]                Markup to be placed in the Modal when created
     * @param {Function}            [options.onShow]                Callback function to run when the Modal is opened.
     * @param {Function}            [options.onDismiss]             Callback function to run when the Modal is closed. Return `false` to cancel dismissing the Modal.
     * @param {Boolean}             [options.closeOnClick]          Flag to close the modal when clicking outside of it.
     * @param {Boolean}             [options.closeOnEscape]         Determines if the Modal should close when "Esc" key is pressed. Defaults to true.
     * @param {Boolean}             [options.responsive]            Determines if the Modal should behave responsively (adapt to smaller viewports).
     * @param {Boolean}             [options.disableScroll]         Determines if the Modal should 'disable' the page's scroll (not the Modal's body).
     * @param {String}              [options.triggerEvent]          (advanced) Trigger's event to be listened. Defaults to 'click'.
     *
     * @sample Ink_UI_Modal_1.html
     */

    function upName(dimension) {
        // omg IE
        var firstCharacter = dimension.match(/^./)[0];
        return firstCharacter.toUpperCase() + dimension.replace(/^./, '');
    }
    function maxName(dimension) {
        return 'max' + upName(dimension);
    }

    var openModals = [];

    var Modal = function(selector, options) {
        if (!selector) {
            this._element = null;
        } else {
            this._element = Common.elOrSelector(selector, 'Ink.UI.Modal markup');
        }

        this._options = {
            /**
             * Width, height and markup really optional, as they can be obtained by the element
             */
            width:        undefined,
            height:       undefined,

            /**
             * To add extra classes
             */
            shadeClass: undefined,
            modalClass: undefined,

            /**
             * Optional trigger properties
             */
            trigger:      undefined,
            triggerEvent: 'click',
            autoDisplay:  true,

            /**
             * Remaining options
             */
            markup:       undefined,
            onShow:       undefined,
            onDismiss:    undefined,
            closeOnClick: false,
            closeOnEscape: true,
            responsive:    true,
            disableScroll: true
        };


        this._handlers = {
            click:   Ink.bindEvent(this._onShadeClick, this),
            keyDown: Ink.bindEvent(this._onKeyDown, this),
            resize:  Ink.bindEvent(this._onResize, this)
        };

        this._wasDismissed = false;

        /**
         * Modal Markup
         */
        if( this._element ){
            this._markupMode = Css.hasClassName(this._element,'ink-modal'); // Check if the full modal comes from the markup
        } else {
            this._markupMode = false;
        }

        if( !this._markupMode ){
            this._modalShadow      = document.createElement('div');
            this._modalShadowStyle = this._modalShadow.style;

            this._modalDiv         = document.createElement('div');
            this._modalDivStyle    = this._modalDiv.style;

            if( !!this._element ){
                this._options.markup = this._element.innerHTML;
            }

            /**
             * Not in full markup mode, let's set the classes and css configurations
             */
            Css.addClassName( this._modalShadow,'ink-shade' );
            Css.addClassName( this._modalDiv,'ink-modal ink-space' );

            /**
             * Applying the main css styles
             */
            // this._modalDivStyle.position = 'absolute';
            this._modalShadow.appendChild( this._modalDiv);
            document.body.appendChild( this._modalShadow );
        } else {
            this._modalDiv         = this._element;
            this._modalDivStyle    = this._modalDiv.style;
            this._modalShadow      = this._modalDiv.parentNode;
            this._modalShadowStyle = this._modalShadow.style;

            this._contentContainer = Selector.select(".modal-body", this._modalDiv)[0];
            if( !this._contentContainer){
                throw new Error('Ink.UI.Modal: Missing div with class "modal-body"');
            }

            this._options.markup = this._contentContainer.innerHTML;

            /**
             * First, will handle the least important: The dataset
             */
            this._options = Ink.extendObj(this._options,InkElement.data(this._element));

        }

        /**
         * Now, the most important, the initialization options
         */
        this._options = Ink.extendObj(this._options,options || {});

        if( !this._markupMode ){
            this.setContentMarkup(this._options.markup);
        }

        if( typeof this._options.shadeClass === 'string' ){
            Css.addClassName(this._modalShadow, this._options.shadeClass);
        }

        if( typeof this._options.modalClass === 'string' ){
            Css.addClassName(this._modalDiv, this._options.modalClass);
        }

        if( this._options.trigger ) {
            var triggerElements = Common.elsOrSelector(this._options.trigger, '');
            Event.observeMulti(triggerElements, this._options.triggerEvent, Ink.bindEvent(this.open, this));
        } else if ( this._options.autoDisplay.toString() === "true" ) {
            this.open();
        }
    };

    Modal.prototype = {

        /**
         * Responsible for repositioning the modal
         * 
         * @method _reposition
         * @private
         */
        _reposition: function(){
            this._modalDivStyle.marginTop = (-InkElement.elementHeight(this._modalDiv)/2) + 'px';
            this._modalDivStyle.marginLeft = (-InkElement.elementWidth(this._modalDiv)/2) + 'px';
        },

        /**
         * Responsible for resizing the modal
         * 
         * @method _onResize
         * @param {Boolean|Event} runNow Its executed in the begining to resize/reposition accordingly to the viewport. But usually it's an event object.
         * @private
         */
        _onResize: function( runNow ){
            if( typeof runNow === 'boolean' ){
                this._timeoutResizeFunction.call(this);
            } else if( !this._resizeTimeout && (runNow && typeof runNow === 'object') ){
                this._resizeTimeout = setTimeout(Ink.bind(this._timeoutResizeFunction, this),250);
            }
        },

        /**
         * Timeout Resize Function
         * 
         * @method _timeoutResizeFunction
         * @private
         */
        _timeoutResizeFunction: function(){
            /**
             * Getting the current viewport size
             */
            var isPercentage = {
                width: ('' + this._options.width).indexOf('%') !== -1,
                height: ('' + this._options.height).indexOf('%') !== -1
            };
            var currentViewport = {
                height: InkElement.viewportHeight(),
                width: InkElement.viewportWidth()
            };

            InkArray.forEach(['height', 'width'], Ink.bind(function (dimension) {
                // Not used for percentage measurements
                if (isPercentage[dimension]) { return; }

                if (currentViewport[dimension] > this.originalStatus[dimension]) {
                    this._modalDivStyle[dimension] = this._modalDivStyle[maxName(dimension)];
                } else {
                    this._modalDivStyle[dimension] = Math.round(currentViewport[dimension] * 0.9) + 'px';
                }
            }, this));

            this._resizeContainer();
            this._reposition();
            this._resizeTimeout = undefined;
        },

        /**
         * Handle clicks on the shade element.
         * 
         * @method _onShadeClick
         * @param {Event} ev
         * @private
         */
        _onShadeClick: function(ev) {
            var tgtEl = Event.element(ev);

            if (Css.hasClassName(tgtEl, 'ink-close') || Css.hasClassName(tgtEl, 'ink-dismiss') || 
                InkElement.findUpwardsBySelector(tgtEl, '.ink-close,.ink-dismiss') ||
                (
                    this._options.closeOnClick &&
                    (!InkElement.descendantOf(this._shadeElement, tgtEl) || (tgtEl === this._shadeElement))
                )
            ) {
                var alertsInTheModal = Selector.select('.ink-alert', this._shadeElement),
                    alertsLength = alertsInTheModal.length;
                for( var i = 0; i < alertsLength; i++ ){
                    if( InkElement.descendantOf(alertsInTheModal[i], tgtEl) ){
                        return;
                    }
                }

                this.dismiss();

                // Only stop the event if this dismisses this modal
                if (this._wasDismissed) {
                    Event.stop(ev);
                }
            }
        },

        /**
         * Responsible for handling the escape key pressing.
         *
         * @method _onKeyDown
         * @param  {Event} ev
         * @private
         */
        _onKeyDown: function(ev) {
            if (ev.keyCode !== 27 || this._wasDismissed) { return; }
            if (this._options.closeOnEscape.toString() === 'true' &&
                    openModals[openModals.length - 1] === this) {
                this.dismiss();
                if (this._wasDismissed) {
                    Event.stop(ev);
                }
            }
        },

        /**
         * Responsible for setting the size of the modal (and position) based on the viewport.
         * 
         * @method _resizeContainer
         * @private
         */
        _resizeContainer: function() {
            // [3.0.0] drop this because everyone should have the new CSS now, which has this rule already with .ink-modal-is-open.
            this._contentElement.style.overflow = this._contentElement.style.overflowX = this._contentElement.style.overflowY = 'hidden';
            var containerHeight = InkElement.elementHeight(this._modalDiv);

            this._modalHeader = Selector.select('.modal-header',this._modalDiv)[0];
            if( this._modalHeader ){
                containerHeight -= InkElement.elementHeight(this._modalHeader);
            }

            this._modalFooter = Selector.select('.modal-footer',this._modalDiv)[0];
            if( this._modalFooter ){
                containerHeight -= InkElement.elementHeight(this._modalFooter);
            }

            this._contentContainer.style.height = containerHeight + 'px';
            if( containerHeight !== InkElement.elementHeight(this._contentContainer) ){
                this._contentContainer.style.height = ~~(containerHeight - (InkElement.elementHeight(this._contentContainer) - containerHeight)) + 'px';
            }

            if( this._markupMode ){ return; }

            this._contentContainer.style.overflow = this._contentContainer.style.overflowX = 'hidden';
            this._contentContainer.style.overflowY = 'auto';
            this._contentElement.style.overflow = this._contentElement.style.overflowX = this._contentElement.style.overflowY = 'visible';
        },

        /**
         * Responsible for 'disabling' the page scroll
         * 
         * @method _disableScroll
         * @private
         */
        _disableScroll: function() {
            var htmlEl = document.documentElement;
            this._oldHtmlOverflows = [ htmlEl.style.overflowX,
                htmlEl.style.overflowY ];
            htmlEl.style.overflowX = htmlEl.style.overflowY = 'hidden';
        },

        /**************
         * PUBLIC API *
         **************/

        /**
         * Opens this Modal. 
         * Use this if you created the modal with `autoOpen: false`
         * to open the modal when you want to.
         * @method open 
         * @param {Event} [event] (internal) In case its fired by the internal trigger.
         */
        open: function(event) {

            if( event ){ Event.stop(event); }

            var elem = (document.compatMode === "CSS1Compat") ?  document.documentElement : document.body;

            this._resizeTimeout    = null;

            Css.addClassName( this._modalShadow,'ink-shade' );
            this._modalShadowStyle.display = this._modalDivStyle.display = 'block';
            setTimeout(Ink.bind(function() {
                Css.addClassName( this._modalShadow, 'visible' );
                Css.addClassName( this._modalDiv, 'visible' );
            }, this), 100);

            /**
             * Fallback to the old one
             */
            this._contentElement = this._modalDiv;
            this._shadeElement   = this._modalShadow;

            if( !this._markupMode ){
                /**
                 * Setting the content of the modal
                 */
                this.setContentMarkup( this._options.markup );
            }

            /**
             * If any size has been user-defined, let's set them as max-width and max-height
             */

            var isPercentage = {
                width: ('' + this._options.width).indexOf('%') !== -1,
                height: ('' + this._options.height).indexOf('%') !== -1
            };

            InkArray.forEach(['width', 'height'], Ink.bind(function (dimension) {
                if (this._options[dimension] !== undefined) {
                    this._modalDivStyle[dimension] = this._options[dimension];
                    if (!isPercentage[dimension]) {
                        this._modalDivStyle[maxName(dimension)] =
                            InkElement['element' + upName(dimension)](this._modalDiv) + 'px';
                    }
                } else {
                    this._modalDivStyle[maxName(dimension)] = InkElement['element' + upName(dimension)](this._modalDiv) + 'px';
                }

                if (isPercentage[dimension] && parseInt(elem['client' + maxName(dimension)], 10) <= parseInt(this._modalDivStyle[dimension], 10) ) {
                    this._modalDivStyle[dimension] = Math.round(parseInt(elem['client' + maxName(dimension)], 10) * 0.9) + 'px';
                }
            }, this));

            this.originalStatus = {
                viewportHeight:     InkElement.elementHeight(elem),
                viewportWidth:      InkElement.elementWidth(elem),
                height:             InkElement.elementHeight(this._modalDiv),
                width:              InkElement.elementWidth(this._modalDiv)
            };

            /**
             * Let's 'resize' it:
             */
            if( this._options.responsive.toString() === 'true' ) {
                this._onResize(true);
                Event.observe( window,'resize',this._handlers.resize );
            } else {
                this._resizeContainer();
                this._reposition();
            }

            if (this._options.onShow) {
                this._options.onShow(this);
            }

            if(this._options.disableScroll.toString() === 'true') {
                this._disableScroll();
            }

            // subscribe events
            Event.observe(this._shadeElement, 'click', this._handlers.click);
            if (this._options.closeOnEscape.toString() === 'true') {
                Event.observe(document, 'keydown', this._handlers.keyDown);
            }

            Common.registerInstance(this, this._shadeElement, 'modal');

            this._wasDismissed = false;
            openModals.push(this);

            Css.addClassName(document.documentElement, 'ink-modal-is-open');
        },

        /**
         * Closes the modal
         * 
         * @method dismiss
         * @public
         */
        dismiss: function() {
            if (this._wasDismissed) { /* Already dismissed. WTF IE. */ return; }

            if (this._options.onDismiss) {
                var ret = this._options.onDismiss(this);
                if (ret === false) { return; }
            }

            this._wasDismissed = true;

            if( this._options.responsive ){
                Event.stopObserving(window, 'resize', this._handlers.resize);
            }

            // this._modalShadow.parentNode.removeChild(this._modalShadow);

            if( !this._markupMode ){
                this._modalShadow.parentNode.removeChild(this._modalShadow);
                this.destroy();
            } else {
                Css.removeClassName( this._modalDiv, 'visible' );
                Css.removeClassName( this._modalShadow, 'visible' );

                this._waitForFade(this._modalShadow, Ink.bind(function () {
                    this._modalShadowStyle.display = 'none';
                }, this));
            }

            openModals = InkArray.remove(openModals, InkArray.keyValue(this, openModals), 1);

            if (openModals.length === 0) {  // Document level stuff now there are no modals in play.
                var htmlEl = document.documentElement;

                // Reenable scroll
                if(this._options.disableScroll) {
                    htmlEl.style.overflowX = this._oldHtmlOverflows[0];
                    htmlEl.style.overflowY = this._oldHtmlOverflows[1];
                }

                // Remove the class from the HTML element.
                Css.removeClassName(htmlEl, 'ink-modal-is-open');
            }
        },

        /**
         * Utility function to listen to the onTransmissionEnd event, or wait using setTimeouts
         *
         * Specific to this._element
         */
        _waitForFade: function (elem, callback) {
            if (!opacitySupported) { return callback(); }

            var transitionEndEventNames = [
                'transitionEnd', 'oTransitionEnd', 'webkitTransitionEnd'];
            var classicName;
            var evName;
            for (var i = 0, len = transitionEndEventNames.length; i < len; i++) {
                evName = transitionEndEventNames[i];
                classicName = 'on' + evName.toLowerCase();
                if (classicName in elem) {
                    Event.observeOnce(elem, evName, callback);
                    return;
                }
            }
            var fadeChecker = function () {
                if( +Css.getStyle(elem, 'opacity') > 0 ){
                    setTimeout(fadeChecker, 250);
                } else {
                    callback();
                }
            };
            setTimeout(fadeChecker, 500);
        },

        /**
         * Removes the modal from the DOM
         * 
         * @method destroy
         * @public
         */
        destroy: function() {
            Common.unregisterInstance(this._instanceId);
        },

        /**
         * Returns the content DOM element
         * 
         * @method getContentElement
         * @return {DOMElement} Modal main cointainer.
         * @public
         */
        getContentElement: function() {
            return this._contentContainer;
        },

        /**
         * Replaces the content markup
         * 
         * @method setContentMarkup
         * @param {String} contentMarkup
         * @public
         */
        setContentMarkup: function(contentMarkup) {
            if( !this._markupMode ){
                this._modalDiv.innerHTML = [contentMarkup].join('');
                this._contentContainer = Selector.select(".modal-body",this._modalDiv);
                if( !this._contentContainer.length ){
                    // throw 'Missing div with class "modal-body"';
                    var tempHeader = Selector.select(".modal-header",this._modalDiv);
                    var tempFooter = Selector.select(".modal-footer",this._modalDiv);

                    InkArray.each(tempHeader, InkElement.remove);
                    InkArray.each(tempFooter, InkElement.remove);

                    var body = document.createElement('div');
                    Css.addClassName(body,'modal-body');
                    body.innerHTML = this._modalDiv.innerHTML;
                    this._modalDiv.innerHTML = '';

                    var toAdd = tempHeader.concat([body]).concat(tempFooter);
                    InkArray.each(toAdd, Ink.bindMethod(this._modalDiv, 'appendChild'));

                    this._contentContainer = Selector.select(".modal-body",this._modalDiv);
                }
                this._contentContainer = this._contentContainer[0];
            } else {
                this._contentContainer.innerHTML = contentMarkup;
            }
            this._contentElement = this._modalDiv;
            this._resizeContainer();
        }

    };

    return Modal;

});

/**
 * Pagination elements
 * @module Ink.UI.Pagination_1
 * @version 1
 */
 
Ink.createModule('Ink.UI.Pagination', '1',
    ['Ink.UI.Common_1','Ink.Dom.Event_1','Ink.Dom.Css_1','Ink.Dom.Element_1','Ink.Dom.Selector_1'],
    function(Common, Event, Css, Element, Selector ) {
    'use strict';

    /**
     * Function to create the pagination anchors
     *
     * @method genAel
     * @private
     * @param  {String} inner HTML to be placed inside the anchor.
     * @return {DOMElement}  Anchor created
     */
    var genAEl = function(inner, index, options) {
        var aEl = document.createElement('a');
        aEl.setAttribute('href', '#');
        if (typeof index === 'number') {
            aEl.setAttribute('data-index', index);
        }
        if(options && options.wrapText) {
            var spanEl = document.createElement('span');
            aEl.appendChild(spanEl);
            spanEl.innerHTML = inner;
        } else {
            aEl.innerHTML = inner;
        }
        return aEl;
    };

    /**
     * @class Ink.UI.Pagination
     * @constructor
     * @version 1
     * @param {String|DOMElement}   selector                    Selector or element
     * @param {Object}              options                     Options
     * @param {Number}              [options.size]              Number of pages.
     * @param {Number}              [options.totalItemCount]    Total numeber of items to display
     * @param {Number}              [options.itemsPerPage]      Number of items per page.
     * @param {Number}              [options.maxSize]           If passed, only shows at most maxSize items. displays also first|prev page and next page|last buttons
     * @param {Number}              [options.start]             Start page. defaults to 1
     * @param {Boolean}             [options.sideButtons=true]  Whether to show the first, last, previous, next, previousPage and lastPage buttons. Do not use together with maxSize.
     * @param {String}              [options.firstLabel]        Text for the first page button. Defaults to 'First'.
     * @param {String}              [options.lastLabel]         Text for the last page button. Defaults to 'Last'.
     * @param {String}              [options.previousLabel]     Text for the previous button. Defaults to 'Previous'-
     * @param {String}              [options.nextLabel]         Text for the next button. Defaults to 'Next'
     * @param {String}              [options.previousPageLabel] Text for the previous page button. Defaults to 'Previous {Items per page}'.
     * @param {String}              [options.nextPageLabel]     Text for the next page button. Defaults to 'Next {Items per page}'.
     * @param {Function}            [options.onChange]          Callback to be called when a page changes. Called with `(thisPaginator, newPageNumber)`.
     * @param {String}              [options.hashParameter]     Parameter to use on setHash. Defaults to 'page'.
     * @param {String}              [options.parentTag]         HTML Tag used as the parent node.
     * @param {String}              [options.childTag]          HTML Tag used as the child nodes.
     * @param {String}              [options.wrapperClass]      CSS Class used in the wrapper element
     * @param {String}              [options.paginationClass]   CSS Class used in the pagination element
     * @param {String}              [options.activeClass]       CSS Class used to mark page as active
     * @param {String}              [options.disabledClass]     CSS Class used to mark page as disabled
     * @param {String}              [options.hideClass]         CSS Class used to hide elements
     * @param {String}              [options.previousClass]     CSS Class used in the previous element
     * @param {String}              [options.previousPageClass] CSS Class used in the previous page element
     * @param {String}              [options.nextClass]         CSS Class used in the next element
     * @param {String}              [options.nextPageClass]     CSS Class used in the next page element
     * @param {Function}            [options.numberFormatter]   Number formatter function. Receives a 0-indexed number and returns the text for the numbered page button.
     *
     * @sample Ink_UI_Pagination_1.html
     */
    var Pagination = function(selector, options) {

        this._element = Common.elOrSelector(selector, 'Ink.UI.Pagination element');

        this._options = Common.options('Ink.UI.Pagination_1', {
            size:              ['Integer', null],
            totalItemCount:    ['Integer', null],
            itemsPerPage:      ['Integer', null],
            maxSize:           ['Integer', null],
            start:             ['Integer', 1],
            sideButtons:       ['Boolean', 1 /* actually `true` but we want to see if user is using the default or not. */],
            // TODO add pagination-type which accepts color strings, "chevron" and "dotted". Basically classes to add to the UL.
            firstLabel:        ['String', 'First'],
            lastLabel:         ['String', 'Last'],
            previousLabel:     ['String', 'Previous'],
            nextLabel:         ['String', 'Next'],
            previousPageLabel: ['String', null],
            nextPageLabel:     ['String', null],
            onChange:          ['Function', undefined],
            hashParameter:     ['String', 'page'],
            parentTag:         ['String', 'ul'],
            childTag:          ['String', 'li'],
            wrapperClass:      ['String', 'ink-navigation'],
            paginationClass:   ['String', 'pagination'],
            activeClass:       ['String', 'active'],
            disabledClass:     ['String', 'disabled'],
            hideClass:         ['String', 'hide-all'],
            previousClass:     ['String', 'previous'],
            previousPageClass: ['String', 'previousPage'],
            nextClass:         ['String', 'next'],
            nextPageClass:     ['String', 'nextPage'],

            numberFormatter: ['Function', function(i) { return i + 1; }]
        }, options || {}, this._element);

        if (!this._options.previousPageLabel) {
            this._options.previousPageLabel = this._options.previousLabel + ' ' + this._options.maxSize;
        }

        if (!this._options.nextPageLabel) {
            this._options.nextPageLabel = this._options.nextLabel + ' ' + this._options.maxSize;
        }

        this._handlers = {
            click: Ink.bindEvent(this._onClick,this)
        };

        if (Common.isInteger(this._options.totalItemCount) && Common.isInteger(this._options.itemsPerPage)) {
            this._size = this._calculateSize(this._options.totalItemCount, this._options.itemsPerPage);
        } else if (Common.isInteger(this._options.size)) {
            this._size = this._options.size;
        } else {
            Ink.error('Ink.UI.Pagination: Please supply a size option or totalItemCount and itemsPerPage options.');
            this._size = 0;
        }

        this.setOnChange(this._options.onChange);

        this._current = this._options.start - 1;
        this._itemLiEls = [];

        this._init();
    };

    Pagination.prototype = {

        /**
         * Init function called by the constructor
         *
         * @method _init
         * @private
         */
        _init: function() {
            // generate and apply DOM
            this._generateMarkup(this._element);

            this._updateItems();

            // subscribe events
            this._observe();

            Common.registerInstance(this, this._element, 'pagination');
        },

        /**
         * Responsible for setting listener in the 'click' event of the Pagination element.
         *
         * @method _observe
         * @private
         */
        _observe: function() {
            Event.observeDelegated(this._element, 'click', '.' + this._options.paginationClass + ' > ' + this._options.childTag, this._handlers.click);
        },

        /**
         * Calculate how many pages are necessary for `count` items, and `itemsPerPage` items per page.
         *
         * @method _calculateSize
         * @param count
         * @param itemsPerPage
         * @private
         **/
        _calculateSize: function (count, itemsPerPage) {
            return Math.ceil(count / itemsPerPage);
        },
        /**
         * Updates the markup everytime there's a change in the Pagination object.
         *
         * @method _updateItems
         * @private
         */
        _updateItems: function() {
            var liEls = this._itemLiEls;

            var isSimpleToggle = this._size === liEls.length;

            var i, f, liEl;

            if (isSimpleToggle) {
                // just toggle active class
                for (i = 0, f = this._size; i < f; ++i) {
                    Css.setClassName(liEls[i], this._options.activeClass, i === this._current);
                }
            }
            else {
                // remove old items
                for (i = liEls.length - 1; i >= 0; --i) {
                    this._ulEl.removeChild(liEls[i]);
                }

                // add new items
                liEls = [];
                for (i = 0, f = this._size; i < f; ++i) {
                    liEl = document.createElement(this._options.childTag);
                    liEl.appendChild( genAEl( this._options.numberFormatter(i), i) );
                    // add "active" class if this is the active element.
                    Css.setClassName(liEl, this._options.activeClass, i === this._current);
                    this._ulEl.insertBefore(liEl, this._nextEl);
                    liEls.push(liEl);
                }
                this._itemLiEls = liEls;
            }

            if (this._options.maxSize) {
                // toggle visible items
                var page = Math.floor( this._current / this._options.maxSize );
                var pi = this._options.maxSize * page;
                var pf = pi + this._options.maxSize - 1;

                for (i = 0, f = this._size; i < f; ++i) {
                    liEl = liEls[i];
                    Css.setClassName(liEl, this._options.hideClass, i < pi || i > pf);
                }

                this._pageStart = pi;
                this._pageEnd = pf;
                this._page = page;

                Css.setClassName(this._prevPageEl, this._options.disabledClass, !this.hasPreviousPage());
                Css.setClassName(this._nextPageEl, this._options.disabledClass, !this.hasNextPage());

                Css.setClassName(this._firstEl, this._options.disabledClass, this.isFirst());
                Css.setClassName(this._lastEl, this._options.disabledClass, this.isLast());
            }

            // update prev and next
            if (this._prevEl) {
                Css.setClassName(this._prevEl, this._options.disabledClass, !this.hasPrevious());
            }
            if (this._nextEl) {
                Css.setClassName(this._nextEl, this._options.disabledClass, !this.hasNext());
            }
        },

        /**
         * Returns the top element for the gallery DOM representation
         *
         * @method _generateMarkup
         * @param {DOMElement} el
         * @private
         */
        _generateMarkup: function(el) {
            Css.addClassName(el, 'ink-navigation');

            var ulEl = Ink.s('.' + this._options.paginationClass, el);
            var hasUlAlready = false;

            if( !ulEl ){
                ulEl = document.createElement(this._options.parentTag);
                Css.addClassName(ulEl, this._options.paginationClass);
            } else {
                hasUlAlready = true;
            }

            var isChevron = Css.hasClassName(ulEl, 'chevron');
            var isDotted = Css.hasClassName(ulEl, 'dotted');

            // Creates <li> elements for firstPage, nextPage, first, last, etc.
            var createLiEl = Ink.bind(function (name, options) {
                var liEl = document.createElement(this._options.childTag);
                var aEl = genAEl(this._options[name + 'Label'], undefined, { wrapText: options && options.wrapText });
                Css.addClassName(liEl, this._options[name + 'Class']);
                liEl.appendChild(aEl);
                ulEl.appendChild(liEl);
                return liEl;
            }, this);

            if (!isDotted && this._options.maxSize) {
                this._firstEl = createLiEl('first');
                this._prevPageEl = createLiEl('previousPage');
            }

            // When we're dotted, the default for sideButtons is `false`. When we're note, it's `true`.
            // Since the default is actually "1", we do a === true check when we're dotted, and a truthish check when we're not.
            if ((isDotted && this._options.sideButtons === true) || (!isDotted && this._options.sideButtons)) {
                this._prevEl = createLiEl('previous', { wrapText: isChevron });
                this._nextEl = createLiEl('next', { wrapText: isChevron });
            }

            if (!isDotted && this._options.maxSize) {
                this._nextPageEl = createLiEl('nextPage');
                this._lastEl = createLiEl('last');
            }

            if( !hasUlAlready ){
                el.appendChild(ulEl);
            }

            this._ulEl = ulEl;
        },

        /**
         * Click handler
         *
         * @method _onClick
         * @param {Event} ev
         * @private
         */
        _onClick: function(ev) {
            Event.stop(ev);

            var liEl = Event.element(ev);
            if ( Css.hasClassName(liEl, this._options.activeClass) ||
                 Css.hasClassName(liEl, this._options.disabledClass) ) { return; }

            var isPrev = Css.hasClassName(liEl, this._options.previousClass);
            var isNext = Css.hasClassName(liEl, this._options.nextClass);
            var isPrevPage = Css.hasClassName(liEl, this._options.previousPageClass);
            var isNextPage = Css.hasClassName(liEl, this._options.nextPageClass);
            var isFirst = Css.hasClassName(liEl, this._options.firstClass);
            var isLast = Css.hasClassName(liEl, this._options.lastClass);

            if (isFirst) {
                this.setCurrent(0);
            }
            else if (isLast) {
                this.setCurrent(this._size - 1);
            }
            else if (isPrevPage || isNextPage) {
                this.setCurrent( (isPrevPage ? -1 : 1) * this._options.maxSize, true /* relative */);
            }
            else if (isPrev || isNext) {
                this.setCurrent(isPrev ? -1 : 1, true /* relative */);
            }
            else {
                var aElem = Selector.select('[data-index]', liEl)[0];
                var nr = aElem && parseInt( aElem.getAttribute('data-index'), 10);
                this.setCurrent(nr);
            }
        },


        /**
         * Allows you to subscribe to the onChange event
         *
         * @method setOnChange
         * @param cb {Function} Callback called with `(thisPaginator, newPageNumber)`.
         */
        setOnChange: function (onChange) {
            if (onChange !== undefined && typeof onChange !== 'function') {
                throw new TypeError('onChange option must be a function!');
            }
            this._onChange = onChange;
        },

        /**************
         * PUBLIC API *
         **************/

        /**
         * Sets the number of pages
         *
         * @method setSize
         * @param {Number} sz number of pages
         * @public
         */
        setSize: function(sz) {
            if (!Common.isInteger(sz)) {
                throw new TypeError('1st argument must be an integer number!');
            }

            this._size = sz;
            this._updateItems();
            this._current = 0;
        },

        /**
         * Sets the number of pages, then call setSize().
         *
         * @param setSizeInItems
         * @param {Number} totalItems       Total number of items
         * @param {Number} itemsPerPage     Items per page
         */
        setSizeInItems: function (totalItems, itemsPerPage) {
            var pageNumber = Math.ceil(totalItems / itemsPerPage);
            this.setSize(pageNumber);
        },

        /**
         * Sets the current page.
         *
         * @method setCurrent
         * @param {Number} nr           Sets the current page to given number.
         * @param {Boolean} isRelative  Flag to change the position from absolute to relative.
         * @public
         */
        setCurrent: function(nr, isRelative) {
            if (!Common.isInteger(nr)) {
                throw new TypeError('1st argument must be an integer number!');
            }

            if (isRelative) {
                nr += this._current;
            }

            if (nr > this._size - 1) {
                nr = this._size - 1;
            }

            if (nr < 0) {
                nr = 0;
            }

            this._current = nr;
            this._updateItems();

            if (this._onChange) {
                this._onChange(this, nr);
            }

            /*if (this._options.setHash) {
                var o = {};
                o[this._options.hashParameter] = nr;
                Common.setHash(o);
            }*/  // undocumented option, removing
        },

        /**
         * Gets the number of pages
         *
         * @method getSize
         * @return {Number} Number of pages
         * @public
         */
        getSize: function() {
            return this._size;
        },

        /**
         * Gets the current page index
         *
         * @method getCurrent
         * @return {Number} Current page
         * @public
         */
        getCurrent: function() {
            return this._current;
        },

        /**
         * Checks if it's at the first page
         *
         * @method isFirst
         * @return {Boolean} True if at first page
         * @public
         */
        isFirst: function() {
            return this._current === 0;
        },

        /**
         * Checks if it's on the last page
         *
         * @method isLast
         * @return {Boolean} True if at last page
         * @public
         */
        isLast: function() {
            return this._current === this._size - 1;
        },

        /**
         * Checks if it has previous pages
         *
         * @method hasPrevious
         * @return {Boolean} True if has prior pages
         * @public
         */
        hasPrevious: function() {
            return this._current > 0;
        },

        /**
         * Checks if it has next pages
         *
         * @method hasNext
         * @return {Boolean} True if has pages ahead
         * @public
         */
        hasNext: function() {
            return this._current < this._size - 1;
        },

        /**
         * Checks if it has a previous set of pages
         *
         * @method hasPreviousPage
         * @return {Boolean} Returns true iif has prior set of page(s)
         * @public
         */
        hasPreviousPage: function() {
            return this._options.maxSize && this._current > this._options.maxSize - 1;
        },

        /**
         * Checks if it has a next set of pages
         *
         * @method hasNextPage
         * @return {Boolean} Returns true iif has set of page(s) ahead
         * @public
         */
        hasNextPage: function() {
            return this._options.maxSize && this._size - this._current >= this._options.maxSize + 1;
        },

        /**
         * Unregisters the component and removes its markup
         *
         * @method destroy
         * @public
         */
        destroy: Common.destroyComponent
    };

    return Pagination;

});
/**
 * Animated progress bars
 * @module Ink.UI.ProgressBar_1
 * @version 1
 */

Ink.createModule('Ink.UI.ProgressBar', '1', ['Ink.UI.Common_1', 'Ink.Dom.Selector_1','Ink.Dom.Element_1'], function( Common, Selector, Element ) {
    'use strict';

    /**
     * Associated to a .ink-progress-bar element, it provides a setValue() method to change the element's value.
     * 
     * @class Ink.UI.ProgressBar
     * @constructor
     * @version 1
     * @param {String|DOMElement}   selector                Element or selector
     * @param {Object}              [options]               Options object
     * @param {Number}              [options.startValue]    Percentage of the bar that is filled. Ranges between 0 and 100. Default: 0
     * @param {Function}            [options.onStart]       Callback called when a change of value is started
     * @param {Function}            [options.onEnd]         Callback called when a change of value ends
     *
     * @sample Ink_UI_ProgressBar_1.html
     */
    var ProgressBar = function( selector, options ){
        this._element = Common.elOrSelector(selector);

        this._options = Ink.extendObj({
            'startValue': 0,
            'onStart': function(){},
            'onEnd': function(){}
        },Element.data(this._element));

        this._options = Ink.extendObj( this._options, options || {});
        this._value = this._options.startValue;

        this._init();
    };

    ProgressBar.prototype = {

        /**
         * Init function called by the constructor
         * 
         * @method _init
         * @private
         */
        _init: function(){
            this._elementBar = Selector.select('.bar',this._element);
            if( this._elementBar.length < 1 ){
                throw '[Ink.UI.ProgressBar] :: Bar element not found';
            }
            this._elementBar = this._elementBar[0];

            this._options.onStart = Ink.bind(this._options.onStart,this);
            this._options.onEnd = Ink.bind(this._options.onEnd,this);
            this.setValue( this._options.startValue );

            Common.registerInstance(this, this._elementBar);
        },

        /**
         * Sets the value of the Progressbar
         * 
         * @method setValue
         * @param {Number} newValue Numeric value, between 0 and 100, that represents the percentage of the bar.
         * @public
         */
        setValue: function( newValue ){
            this._options.onStart( this._value);

            newValue = parseInt(newValue,10);
            if( isNaN(newValue) || (newValue < 0) ){
                newValue = 0;
            } else if( newValue>100 ){
                newValue = 100;
            }
            this._value = newValue;
            this._elementBar.style.width =  this._value + '%';

            this._options.onEnd( this._value );
        }
    };

    return ProgressBar;

});

/**
 * Scroll to content
 * @module Ink.UI.SmoothScroller_1
 * @version 1
 */
Ink.createModule('Ink.UI.SmoothScroller', '1', ['Ink.Dom.Event_1', 'Ink.Dom.Element_1', 'Ink.Dom.Selector_1','Ink.Dom.Loaded_1'], function(Event, InkElement, Selector, Loaded) {
    'use strict';

    var requestAnimationFrame =
        window.requestAnimationFrame ||
        function (cb) { return setTimeout(cb, 10); };

    var cancelAnimationFrame =
        window.cancelAnimationFrame ||
        function (id) { clearTimeout(id); };

    /**
     * @namespace Ink.UI.SmoothScroller
     * @version 1
     * @static
     *
     * SmoothScroller is a component which replaces the default scroll-to behaviour of `<a>` tags which refer to IDs on the page.
     *
     * For example, when you have this:
     *
     *          <a href="#todo">Todo</a>
     *              [...]
     *          <section id="todo">
     *              [...]
     *
     * You can click the `<a>` and the page will scroll until the section you pointed to.
     *
     * When you use SmoothScroller, instead of immediately scrolling to the element, you get a smooth motion.
     *
     * Also, you can define the data-margin option if you have a `position:fixed` top menu ruining the behaviour.
     *
     * @example
     *
     *      <a href="#part1" class="ink-smooth-scroll" data-margin="10">go to Part 1</a>
     *
     *      [lots and lots of content...]
     *
     *      <h1 id="part1">Part 1</h1>
     *
     *      <script>
     *          // ...Although you don't need to do this if you have autoload.js
     *          Ink.requireModules(['Ink.UI.SmoothScroller_1'], function (SmoothScroller) {
     *              SmoothScroller.init('.ink-smooth-scroll');
     *          })
     *      </script>
     */
    var SmoothScroller = {

        /**
         * Sets the speed of the scrolling
         *
         * @property speed
         * @type {Number}
         * @readOnly
         * @static
         */
        speed: 10,

        /**
         * Returns the Y position of an element, relative to the document
         *
         * @method getTop
         * @param  {DOMElement} d DOMElement to get the Y position from
         * @return {Number}   Y position of div 'd'
         * @public
         * @static
         */
        getTop: function(d) {
            return Math.round(
                SmoothScroller.scrollTop() + d.getBoundingClientRect().top);
        },


        /**
         * Returns the current scroll position
         *
         * @method scrollTop
         * @return {Number}  Current scroll position
         * @public
         * @static
         */
        scrollTop: function() {
            var body = document.body,
                d = document.documentElement;
            if (body && body.scrollTop){
                return body.scrollTop;
            }
            if (d && d.scrollTop){
                return d.scrollTop;
            }
            if (window.pageYOffset){
                return window.pageYOffset;
            }
            return 0;
        },

        /**
         * Attaches an event for an element
         *
         * @method add
         * @param  {DOMElement} el DOMElement to make the listening of the event
         * @param  {String} event Event name to be listened
         * @param  {DOMElement} fn Callback function to run when the event is triggered.
         * @public
         * @static
         */
        add: function(el, event, fn) {
            Event.observe(el,event,fn);
        },


        /**
         * Kill an event of an element
         *
         * @method end
         * @param  {String} e Event to be killed/stopped
         * @public
         * @static
         */
        // kill an event of an element
        end: function(e) {
            Event.stopDefault(e);
        },


        /**
         * Moves the scrollbar to the target element. This is the function
         * which animates the scroll position bit by bit. It calls itself in
         * the end through requestAnimationFrame
         *
         * @method scroll
         * @param  {Number} d Y coordinate value to stop
         * @public
         * @static
         */
        scroll: function(d, options) {
            var a = SmoothScroller.scrollTop();
            var margin = options.margin || 0;

            var endPos = d - margin;

            if (endPos > a) {
                a += Math.ceil((endPos - a) / SmoothScroller.speed);
            } else {
                a = a + (endPos - a) / SmoothScroller.speed;
            }

            cancelAnimationFrame(SmoothScroller.interval);

            if (!((a) === endPos || SmoothScroller.offsetTop === a)) {
                SmoothScroller.interval = requestAnimationFrame(
                    Ink.bindMethod(SmoothScroller, 'scroll', d, options), document.body);
            } else {
                SmoothScroller.onDone();
            }

            window.scrollTo(0, a);
            SmoothScroller.offsetTop = a;
        },


        /**
         * Has smooth scrolling applied to relevant elements upon page load.
         *
         * @method init
         * @param [selector='a.scrollableLink,a.ink-smooth-scroll'] Selector string for finding links with smooth scrolling enabled.
         * @public
         * @static
         */
        init: function(selector) {
            Loaded.run(Ink.bindMethod(SmoothScroller, 'render', selector));
        },

        /**
         * This method extracts all the anchors and validates them as # and attaches the events
         *
         * @method render
         * @public
         * @static
         */
        render: function(selector) {
            var a = Selector.select(selector || 'a.scrollableLink,a.ink-smooth-scroll');

            for (var i = 0; i < a.length; i++) {
                var _elm = a[i];
                if (_elm.href && _elm.href.indexOf('#') !== -1 && ((_elm.pathname === location.pathname) || ('/' + _elm.pathname === location.pathname))) {
                    Event.observe(_elm,'click', Ink.bindEvent(SmoothScroller.onClick, this, _elm));
                }
            }
        },


        /**
         * Click handler
         *
         * @method onClick
         * @public
         * @static
         */
        onClick: function(event, _elm) {
            SmoothScroller.end(event);
            if(_elm != null && _elm.getAttribute('href') !== null) {
                var hashIndex = _elm.href.indexOf('#');
                if (hashIndex === -1) {
                    return;
                }

                var data = InkElement.data(_elm);
                var hash = _elm.href.substr((hashIndex + 1));
                var activeLiSelector = 'ul > li.active > ' + selector;

                var selector = 'a[name="' + hash + '"],#' + hash;
                var elm = Selector.select(selector)[0];
                var activeLi = Selector.select(activeLiSelector)[0];
                activeLi = activeLi && activeLi.parentNode;

                if (typeof(elm) !== 'undefined') {
                    if (_elm.parentNode.className.indexOf('active') === -1) {
                        if (activeLi) {
                            activeLi.className = activeLi.className.replace(/(^|\s+)active($|\s+)/g, '');
                        }
                        _elm.parentNode.className += " active";
                    }
                    SmoothScroller.hash = hash;
                    var options = {};
                    if (parseFloat(data.margin)) {
                        options.margin = parseFloat(data.margin);
                    }
                    SmoothScroller.scroll(SmoothScroller.getTop(elm), options);
                }
            }
        },

        /**
         * Called when the scroll movement is done. Updates browser address.
         */
        onDone: function () {
            window.location.hash = SmoothScroller.hash;
        }
    };

    return SmoothScroller;

});

/**
 * Sortable lists
 * @module Ink.UI.SortableList_1
 * @version 1
 */

Ink.createModule('Ink.UI.SortableList', '1', ['Ink.UI.Common_1','Ink.Dom.Css_1','Ink.Dom.Event_1','Ink.Dom.Element_1','Ink.Dom.Selector_1'], function( Common, Css, Events, Element, Selector ) {
    'use strict';
    var hasTouch = (('ontouchstart' in window) ||       // html5 browsers
                    (navigator.maxTouchPoints > 0) ||   // future IE
                    (navigator.msMaxTouchPoints > 0));

    /**
     * Adds sortable behaviour to any list.
     * 
     * @class Ink.UI.SortableList
     * @constructor
     * @version 1
     * @param {String|DOMElement}   selector
     * @param {String}              [options.placeholderClass]          CSS class added to the "ghost" element being dragged around. Defaults to 'placeholder'.
     * @param {String}              [options.draggedClass]              CSS class added to the original element being dragged around. Defaults to 'hide-all'.
     * @param {String}              [options.draggingClass]             CSS class added to the html element when the user is dragging. Defaults to 'dragging'.
     * @param {String}              [options.dragSelector]              CSS selector for the drag enabled nodes. Defaults to 'li'.
     * @param {String}              [options.handleSelector]            CSS selector for the drag handle. If present, you can only drag nodes by this selector.
     * @param {String}              [options.moveSelector]              CSS selector to validate a node move. If present, you can only move nodes inside this selector.
     * @param {Boolean}             [options.swap]                      Flag to swap dragged element and target element instead of reordering it.
     * @param {Boolean}             [options.cancelMouseOut]            Flag to cancel draggin if mouse leaves the container element.
     *
     * @sample Ink_UI_SortableList_1.html
     */
    var SortableList = function(selector, options) {

        this._element = Common.elOrSelector(selector, 'Ink.UI.SortableList');

        this._options = Common.options('Sortable', {
            'placeholderClass': ['String', 'placeholder'],
            'draggedClass': ['String', 'hide-all'],
            'draggingClass': ['String', 'dragging'],
            'dragSelector': ['String', 'li'],
            'dragObject': ['String', null], // Deprecated. Use handleSelector instead.
            'handleSelector': ['String', null],
            'moveSelector': ['String', false],
            'swap': ['Boolean', false],
            'cancelMouseOut': ['Boolean', false]
        }, options || {}, this._element);

        if (this._options.dragObject != null) {
            // [3.0.0] Remove this deprecation notice and stop providing backwards compatibility
            Ink.warn('Ink.UI.SortableList: options.dragObject is now deprecated. ' +
                    'Please use options.handleSelector instead.');
            this._options.handleSelector =
                this._options.handleSelector || this._options.dragObject;
        }

        this._handlers = {
            down: Ink.bind(this._onDown, this),
            move: Ink.bind(this._onMove, this),
            up:   Ink.bind(this._onUp, this)
        };

        this._isMoving = false;

        this._init();
    };

    SortableList.prototype = {

        /**
         * Init function called by the constructor.
         * 
         * @method _init
         * @private
         */
        _init: function() {
            this._down = hasTouch ? 'touchstart mousedown' : 'mousedown';
            this._move = hasTouch ? 'touchmove mousemove' : 'mousemove';
            this._up   = hasTouch ? 'touchend mouseup' : 'mouseup';

            this._observe();
            Common.registerInstance(this, this._element, 'sortableList');
        },

        /**
         * Sets the event handlers.
         * 
         * @method _observe
         * @private
         */
        _observe: function() {
            Events.on(this._element, this._down, this._options.dragSelector, this._handlers.down);
            Events.on(this._element, this._move, this._options.dragSelector, this._handlers.move);
            if(this._options.cancelMouseOut) {
                Events.on(this._element, 'mouseleave', Ink.bind(this.stopMoving, this));
            }
            Events.on(document.documentElement, this._up, this._handlers.up);
        },

        /**
         * Mousedown or touchstart handler
         * 
         * @method _onDown
         * @param {Event} ev
         * @private
         */
        _onDown: function(ev) {
            if (this._isMoving || this._placeholder) { return; }
            if(this._options.handleSelector && !Selector.matchesSelector(ev.target, this._options.handleSelector)) { return; }
            var tgtEl = ev.currentTarget;
            this._isMoving = tgtEl;
            this._placeholder = tgtEl.cloneNode(true);
            this._movePlaceholder(tgtEl);
            this._addMovingClasses();
            return false;
        },

        /**
         * Mousemove or touchmove handler
         * 
         * @method _onMove
         * @param {Event} ev
         * @private
         */
        _onMove: function(ev) {
            this.validateMove(ev.currentTarget);
            return false;
        },

        /**
         * Mouseup or touchend handler
         * 
         * @method _onUp
         * @param {Event} ev
         * @private
         */
        _onUp: function(ev) {
            if (!this._isMoving || !this._placeholder) { return; }
            if (ev.currentTarget === this._isMoving) { return; }
            if (ev.currentTarget === this._placeholder) { return; }
            Element.insertBefore(this._isMoving, this._placeholder);
            this.stopMoving();
            return false;
        },

        /**
         * Adds the CSS classes to interactive elements
         * 
         * @method _addMovingClasses
         * @private
         */
        _addMovingClasses: function(){
            Css.addClassName(this._placeholder, this._options.placeholderClass);
            Css.addClassName(this._isMoving, this._options.draggedClass);
            Css.addClassName(document.documentElement, this._options.draggingClass);
        },

        /**
         * Removes the CSS classes from interactive elements
         * 
         * @method _removeMovingClasses
         * @private
         */
        _removeMovingClasses: function(){
            if(this._isMoving) { Css.removeClassName(this._isMoving, this._options.draggedClass); }
            if(this._placeholder) { Css.removeClassName(this._placeholder, this._options.placeholderClass); }
            Css.removeClassName(document.documentElement, this._options.draggingClass);
        },

        /**
         * Moves the placeholder element relative to the target element
         * 
         * @method _movePlaceholder
         * @param {Element} target_position
         * @private
         */
        _movePlaceholder: function(target){
            var placeholder = this._placeholder,
                target_position,
                placeholder_position,
                from_top,
                from_left;
            if(!placeholder) {
                Element.insertAfter(placeholder, target);
            } else if(this._options.swap){
                Element.insertAfter(placeholder, target);
                Element.insertBefore(target, this._isMoving);
                Element.insertBefore(this._isMoving, placeholder);
            } else {
                target_position = Element.offset(target);
                placeholder_position = Element.offset(this._placeholder);
                from_top = target_position[1] > placeholder_position[1];
                from_left = target_position[0] > placeholder_position[0];
                if( ( from_top && from_left ) || ( !from_top && !from_left ) ) {
                    Element.insertBefore(placeholder, target);
                } else {
                    Element.insertAfter(placeholder, target);
                }
                Element.insertBefore(this._isMoving, placeholder);
            }
        },

        /**************
         * PUBLIC API *
         **************/

        /**
         * Unregisters the component and removes its markup
         * 
         * @method destroy
         * @public
         */
        destroy: Common.destroyComponent,

        /**
         * Visually stops moving. 
         * Removes the placeholder as well as the styling classes.
         * 
         * @method _movePlaceholder
         * @public
         */
        stopMoving: function(){
            this._removeMovingClasses();
            Element.remove(this._placeholder);
            this._placeholder = false;
            this._isMoving = false;
        },

        /**
         * Validate a move.
         * This method is used by the move handler
         * 
         * @method _movePlaceholder
         * @param {Element} elem
         * @public
         */
        validateMove: function(elem){
            if (!this._isMoving || !this._placeholder) { return; }
            if (elem === this._placeholder) {  return; }
            if (elem === this._isMoving) { return; }
            if(!this._options.moveSelector || Selector.matchesSelector(elem, this._options.moveSelector)){
                this._movePlaceholder(elem);
            } else {
                this.stopMoving();  
            }
        }

    };

    return SortableList;
});
/**
 * Highlight elements as you scroll
 * @module Ink.UI.Spy_1
 * @version 1
 */
Ink.createModule('Ink.UI.Spy', '1', ['Ink.UI.Common_1','Ink.Dom.Event_1','Ink.Dom.Css_1','Ink.Dom.Element_1','Ink.Dom.Selector_1'], function(Common, Event, Css, Element, Selector ) {
    'use strict';

    // Maps a spy target (EG a menu with links inside) to spied instances.
    var spyTargets = [
        // [target, [spied, spied, spied...]], ...
    ];

    function targetIndex(target) {
        for (var i = 0, len = spyTargets.length; i < len; i++) {
            if (spyTargets[i][0] === target) {
                return i;
            }
        }
        return null;
    }

    function addSpied(spied, target) {
        var index = targetIndex(target);

        if (index === null) {
            spyTargets.push([target, [spied]]);
        } else {
            spyTargets[index][1].push(spied);
        }
    }

    var observingOnScroll = false;
    function observeOnScroll() {
        if (!observingOnScroll) {
            observingOnScroll = true;
            Event.observe(document, 'scroll', Event.throttle(onScroll, 300));
        }
    }

    function onScroll() {
        for (var i = 0, len = spyTargets.length; i < len; i++) {
            onScrollForTarget(spyTargets[i][0], spyTargets[i][1]);
        }
    }

    function onScrollForTarget(target, spied) {
        var activeEl = findActiveElement(spied);

        // This selector finds li's to deactivate
        var toDeactivate = Selector.select('li.active', target);
        for (var i = 0, total = toDeactivate.length; i < total; i++) {
            Css.removeClassName(toDeactivate[i], 'active');
        }

        if (activeEl === null) {
            return;
        }

        // The link which should be activated has a "href" ending with "#" + name or id of the element
        var menuLinkSelector = 'a[href$="#' + (activeEl.name || activeEl.id) + '"]';

        var toActivate = Selector.select(menuLinkSelector, target);
        for (i = 0, total = toActivate.length; i < total; i++) {
            Css.addClassName(Element.findUpwardsByTag(toActivate[i], 'li'), 'active');
        }
    }

    function findActiveElement(spied) {
        /* 
         * Find the element above the top of the screen, but closest to it.
         *          _____ 
         *         |_____| element 1  (active element)
         *
         *      ------------------------ 
         *     |    _____               |
         *     |   |     |  element 2   |
         *     |   |     |              |
         *     |   |_____|              |
         *      ------- Viewport ------- 
         */

        // Remember that getBoundingClientRect returns coordinates
        // relative to the top left corner of the screen.
        //
        // So checking if it's < 0 is used to tell if
        // the element is above the top of the screen.
        var closest = -Infinity;
        var closestIndex;
        var bBox;
        for( var i = 0, total = spied.length; i < total; i++ ){
            bBox = spied[i].getBoundingClientRect();
            if (bBox.top <= 0 && bBox.top > closest) {
                closest = bBox.top;
                closestIndex = i;
            }
        }
        if (closestIndex === undefined) {
            return null;
        } else {
            return spied[closestIndex];
        }
    }

    /**
     * Spy is an UI component which tells the user which section is currently visible.
     * Spy can be used to highlight a menu item for the section which is visible to the user.
     * You need two things: A menu element (which contains your links inside `li` tags), and an element containing your section's content.
	 * The links must be inside `li` tags. These will get the 'active' class, to signal which item is currently visible. In your CSS you need to add styling for this class.
     * To use Ink.UI.Spy for more than one section, loop through your sections (as you see in the sample below), or just load `autoload.js` and set add the `data-spy="true"` attribute to your sections.
     * The currently visible element's corresponding link in the menu gets the 'visible' class added to it.
     *
     * @class Ink.UI.Spy
     * @constructor
     * @version 1
     * @param {String|DOMElement} selector
     * @param {Object} [options] Options
     * @param {DOMElement|String}     options.target          Target menu where the spy will highlight the right option.
     *
     * @sample Ink_UI_Spy_1.html
     */
    var Spy = function( selector, options ){

        this._element = Common.elOrSelector( selector, 'Ink.UI.Spy_1: Section element' );

        /**
         * Setting default options and - if needed - overriding it with the data attributes
         */
        this._options = Ink.extendObj({
            target: undefined,
            activeClass: 'active' // [todo] Spy#_options.activeClass
        }, Element.data( this._element ) );

        /**
         * In case options have been defined when creating the instance, they've precedence
         */
        this._options = Ink.extendObj(this._options,options || {});

        this._options.target = Common.elOrSelector( this._options.target, 'Ink.UI.Spy_1: Target element' );

        this._init();
    };

    Spy.prototype = {
        /**
         * Init function called by the constructor
         * 
         * @method _init
         * @private
         */
        _init: function() {
            addSpied(this._element, this._options.target);
            observeOnScroll();
            onScroll();

            Common.registerInstance(this, this._element);
        }
    };

    return Spy;

});

/**
 * Stacking items in columns
 * @module Ink.UI.Stacker_1
 * @version 1
 **/

Ink.createModule('Ink.UI.Stacker', 1, ['Ink.UI.Common_1', 'Ink.Dom.Event_1', 'Ink.Dom.Element_1'], function(Common, InkEvent, InkElement) {
    'use strict';

function Stacker(selector, options) {
    this._init(selector, options);
}

Stacker.prototype = {
    /**
     * This module combines several stacks of items together, in smaller screen sizes.
     *
     * The purpose is to have several stacks of items which may have different heights and as such cannot be used because of `float: left` quirks.
     *
     * For example, when you have three different columns of information:
     *
     *     [col. A: 1] [col. B: 1] [col. C: 1]
     *     [col. B: 2] [col. C: 2] [col. C: 2]
     *
     * and the screen resizes and you need a layout of 2 columns, Stacker reorders the stacks so that you get:
     *
     *     [col. A: 1] [col. B: 1]
     *     [col. C: 1] [col. A: 2]
     *     [col. B: 2] [col. C: 2]
     * 
     * Note: If you just want to use a different amount of columns for your items in several viewports, but these items are guaranteed to have a fixed height, don't use this module. Use the `small-*`, `medium-*` and `large-*` classes instead.
     *
     * @class Ink.UI.Stacker_1
     *
     * @constructor
     * @param {DOMElement|String}   [container]                                     Element which contains the stacks (identified by the options.column selector)
     * @param {Object}              [options]                                       Options object.
     * @param {String}              [options.column]                                Selector for the the columns inside the container element. Defaults to '.stacker-column'.
     * @param {String}              [options.item]                                  Selector for the items in your stack. Defaults to '.stacker-item'.
     * @param {Object}              [options.customBreakPoints]                     Options for each breakpoint name. Use this if you have more breakpoints than Ink by default (`large`, `medium`, `small`)
     * @param {Object}              [options.customBreakpoints.BREAKPOINT_NAME]     Custom breakpoints object.
     * @param {String}              options.customBreakpoints.BREAKPOINT_NAME.max   Maximum screen size as seen in your media query
     * @param {String}              options.customBreakpoints.BREAKPOINT_NAME.min   Minimum screen size as seen in your media query
     * @param {String}              options.customBreakpoints.BREAKPOINT_NAME.cols  Column count for this size.
     * @param {Number}              [options.largeMax]                              Upper bound of `large` breakpoint
     * @param {Number}              [options.largeMin]                              Lower bound of `large` breakpoint. Defaults to 961.
     * @param {Number}              [options.mediumMax]                             Upper bound of `medium` breakpoint. Defaults to 960.
     * @param {Number}              [options.mediumMin]                             Lower bound of `medium` breakpoint. Defaults to 651.
     * @param {Number}              [options.smallMax]                              Upper bound of `small` breakpoint. Defaults to 650.
     * @param {Number}              [options.smallMin]                              Lower bound of `small` breakpoint
     *
     * @param {Integer}             [options.largeCols]                             Number of columns in the `large` viewport. Defaults to 3.
     * @param {Integer}             [options.mediumCols]                            Number of columns in the `medium` viewport. Defaults to 2.
     * @param {Integer}             [options.smallCols]                             Number of columns in the `small` viewport. Defaults to 1.
     *
     * @param {Boolean}             [options.isOrdered]                             When false, doesn't reorder stacks when combining them.
     * @param {Function}            [options.onRunCallback]                         Called when instantiated.
     * @param {Function}            [options.onResizeCallback]                      Called when the window resizes.
     * @param {Function}            [options.onAPIReloadCallback]                   Called when the reload function executes.
     *
     * @example
     *
     * Html:
     *
     *     <div id="stacker-container">  <!-- Stacker element -->
     *         <div class="xlarge-33 large-33 medium-50 tiny-100 stacker-column"> <!-- Column element ('.stacker-column' is the default selector) -->
     *             <div id="a" class="stacker-item">a</div> <!-- Item ('.stacker-item' is the default selector) -->
     *             <div id="d" class="stacker-item">d</div>
     *             <div id="g" class="stacker-item">g</div>
     *         </div>
     *         <div class="xlarge-33 large-33 medium-50 tiny-100 hide-small stacker-column">
     *             <div id="b" class="stacker-item">b</div>
     *             <div id="e" class="stacker-item">e</div>
     *             <div id="h" class="stacker-item">h</div>
     *         </div>
     *         <div class="xlarge-33 large-33 medium-50 tiny-100 hide-medium hide-small stacker-column">
     *             <div id="c" class="stacker-item">c</div>
     *             <div id="f" class="stacker-item">f</div>
     *             <div id="i" class="stacker-item">i</div>
     *         </div>
     *     </div>
     *
     * Javascript:
     *
     *     Ink.requireModules(['Ink.UI.Stacker_1'], function (Stacker) {
     *         var stacker = new Stacker('#stacker-container');
     *         // Keep the "stacker" variable around if you want to call addItem and reloadItems
     *     });
     **/
    _init: function(selector, options) {
        this._rootElm = Common.elsOrSelector(selector, 'Ink.UI.Stacker root element')[0] || null;
        if(this._rootElm === null) {
            Ink.warn('Ink.UI.Stacker: No root element');
        }

        this._options = Common.options({
            column: ['String', '.stacker-column'],
            item: ['String', '.stacker-item'],

            // [3.0.0] review this when we have info about our breakpoints from the CSS
            customBreakPoints: ['Object', null], // Must be: {xlarge: {max: 9999, min: 1281, cols: 5}, large:{max:1280, min:1001, cols:4} medium:{max:1000, min:801,cols:3}, ...etc..}
            largeMax: ['Number', Number.MAX_VALUE],
            largeMin: ['Number', 961],
            mediumMax: ['Number', 960],
            mediumMin: ['Number', 651],
            smallMax: ['Number', 650],
            smallMin: ['Number', 0],

            largeCols: ['Integer', 3],
            mediumCols: ['Integer', 2],
            smallCols: ['Integer', 1],

            isOrdered: ['Boolean', true],
            onRunCallback: ['Function', null],
            onResizeCallback: ['Function', null],
            onAPIReloadCallback: ['Function', null]
        }, options || {}, this._rootElm);  

        this._aList = []; 

        this._curLayout = 'large';

        // [todo] is this needed?
        this._runFirstTime = false;

        this._getPageItemsToList();

        if(this._canApplyLayoutChange() || !this._runFirstTime) {
            this._runFirstTime = true;
            this._applyLayoutChange();
            if(typeof(this._options.onRunCallback) === 'function') {
                this._options.onRunCallback(this._curLayout);
            }
        }
        this._addEvents();

        Common.registerInstance(this, this._rootElm);
    },

    /**
     * Adds an item to the end of your stacks.
     * Call `reloadItems()` when you are done adding items.
     * @method addItem
     * @param {DOMElement} item     Element
     **/
    addItem: function(item) {
        this._aList.push(item);
    },

    /**
     * Updates the layout of your items.
     * Call this method after adding items or changing their dimensions. This method is automatically called when the window resizes.
     *
     * @method reloadItems
     **/
    reloadItems: function() {
        this._applyLayoutChange();
        if(typeof(this._options.onAPIReloadCallback) === 'function') {
            this._options.onAPIReloadCallback(this._curLayout);
        }
    },

    _addEvents: function() {
        InkEvent.observe(window, 'resize', Ink.bindEvent(this._onResize, this));
    },

    _onResize: function() {
        if(this._canApplyLayoutChange()) {
            this._removeDomItems();
            this._applyLayoutChange();
            if(typeof(this._options.onResizeCallback) === 'function') {
                this._options.onResizeCallback(this._curLayout);
            }
        }
    },

    _setCurLayout: function() {
        var viewportWidth = InkElement.viewportWidth();
        if(this._options.customBreakpoints && typeof(this._options.customBreakPoints) === 'object') {
            for(var prop in this._options.customBreakPoints) {
                if(this._options.customBreakPoints.hasOwnProperty(prop)) {
                    if(viewportWidth >= Number(this._options.customBreakPoints[prop].min) && viewportWidth <= Number(this._options.customBreakPoints[prop].max) && this._curLayout !== prop) {
                        this._curLayout = prop;
                        return;
                    } 
                }
            }
        } else {
            if(viewportWidth <= Number(this._options.largeMax) && viewportWidth >= Number(this._options.largeMin) && this._curLayout !== 'large') {
                this._curLayout = 'large';
            } else if(viewportWidth >= Number(this._options.mediumMin) && viewportWidth <= Number(this._options.mediumMax) && this._curLayout !== 'medium') {
                this._curLayout = 'medium';
            } else if(viewportWidth >= Number(this._options.smallMin) && viewportWidth <= Number(this._options.smallMax) && this._curLayout !== 'small') {
                this._curLayout = 'small';
            }
        }
    },

    _getColumnsToShow: function() {
        if(this._options.customBreakPoints && typeof(this._options.customBreakPoints) === 'object') {
            return Number(this._options.customBreakPoints[this._curLayout].cols);
        } else {
            return Number(this._options[this._curLayout+'Cols']);
        }
    },

    _canApplyLayoutChange: function() {
        var curLayout = this._curLayout;
        this._setCurLayout();
        if(curLayout !== this._curLayout) {
            return true;
        }
        return false;
    },

    _getPageItemsToList: function() {
        this._aColumn = Ink.ss(this._options.column, this._rootElm);
        var totalCols = this._aColumn.length;
        var index = 0;
        if(totalCols > 0) {
            for(var i=0; i < this._aColumn.length; i++) {
                var aItems = Ink.ss(this._options.item, this._aColumn[i]);
                for(var j=0; j < aItems.length; j++) {
                    if(this._options.isOrdered) {
                        index = i + (j * totalCols);
                    }
                    this._aList[index] = aItems[j];
                    if(!this._options.isOrdered) {
                        index++;
                    }
                    //aItems[j].style.height = (100 + (Math.random() * 100))+'px';
                    aItems[j].parentNode.removeChild(aItems[j]);
                }
            }
            if(this._aList.length > 0 && this._options.isOrdered) {
                var aNewList = [];
                for(var ii=0; ii < this._aList.length; ii++) {
                    if(typeof(this._aList[ii]) !== 'undefined') {
                        aNewList.push(this._aList[ii]);
                    }
                }
                this._aList = aNewList;
            }
        }
    }, 

    _removeDomItems: function() {
        var totalCols = this._aColumn.length;
        if(totalCols > 0) {
            for(var i=0; i < totalCols; i++) {
                var aItems = Ink.ss(this._options.item, this._aColumn[i]);
                for(var j=aItems.length - 1; j >= 0; j--) {
                    aItems[j].parentNode.removeChild(aItems[j]);
                }
            }
        }
    },

    _applyLayoutChange: function() {
        var totalCols = this._getColumnsToShow();
        var totalItems = this._aList.length;
        var index = 0;
        var countCol = 0;
        if(totalCols > 0) {
            while(countCol < totalCols) {
                this._aColumn[countCol].appendChild(this._aList[index]);
                index++;
                countCol++;
                if(index === totalItems) {
                    return;
                }
                if(countCol === totalCols) {
                    countCol = 0;
                }
            }
        }
    }
};

return Stacker;

});

/**
 * Stick elements to the viewport
 * @module Ink.UI.Sticky_1
 * @version 1
 */
Ink.createModule('Ink.UI.Sticky', '1', ['Ink.UI.Common_1','Ink.Dom.Event_1','Ink.Dom.Element_1','Ink.Dom.Css_1'], function(Common, Event, Element, Css) {
    'use strict';

    /**
     * Ink.UI.Sticky makes an element "stick" to the screen and stay in the same place as the user scrolls. To use it, just select an element as you create the Sticky. As you scroll past it, it will stick to the top of the screen.
     * The `activateInLayouts` option controls in what layouts this behaviour happens. By default, it is disabled for the `small` and `tiny` layouts. Pass a comma-separated string to choose just the layouts you need. You can use the `offsetTop` option if you want it to keep some distance from the top of the screen. To avoid it going under the footer of your page, pass a selector to your footer as the `bottomElement` option.
     *
     * @class Ink.UI.Sticky
     * @constructor
     * @version 1
     * @param {String|DOMElement}   selector                    Element or selector
     * @param {Object}              [options] Options           Options object.
     * @param {Number}              [options.offsetBottom]      Number of pixels of distance from the bottomElement. Defaults to 0.
     * @param {Number}              [options.offsetTop]         Number of pixels of distance from the topElement. Defaults to 0.
     * @param {Boolean}             [options.inlineDimensions]  Set to false to disable setting inline CSS dimensions. Use this if you want to use CSS to define your own dimensions. Defaults to true.
     * @param {Boolean}             [options.inlinePosition]    Set to false to disable setting inline CSS positions. Use this if you want to use CSS to define your own positioning. Defaults to true.
     * @param {String}              [options.wrapperClass]      CSS class for the wrapper element. Defaults to 'ink-sticky-wrapper'.
     * @param {String}              [options.stickyClass]       CSS class to stick the element to the screen. Defaults to 'ink-sticky-stuck'.
     * @param {String}              [options.topElement]        CSS Selector that specifies a top element with which the component could collide.
     * @param {String}              [options.bottomElement]     CSS Selector that specifies a bottom element with which the component could collide.
     * @param {Array|String}        [options.activateInLayouts] Layouts in which the sticky behaviour is present. Pass an array or comma-separated string. Defaults to 'tiny,small,medium,large,xlarge'.
     *
     * @sample Ink_UI_Sticky_1.html
     */
    var Sticky = function( selector, options ){
        this._rootElement = Common.elOrSelector(selector, 'Ink.UI.Sticky_1');

        this._options = Common.options({
            offsetBottom: ['Integer', 0],
            offsetTop: ['Integer', 0],
            topElement: ['Element', null],
            wrapperClass: ['String', 'ink-sticky-wrapper'],
            stickyClass: ['String', 'ink-sticky-stuck'],
            inlineDimensions: ['Boolean', true],
            inlinePosition: ['Boolean', true],
            bottomElement: ['Element', null],
            activateInLayouts: ['String', 'tiny,small,medium,large,xlarge']
        }, options || {}, this._rootElement );

        // Because String#indexOf is compatible with lt IE8 but not Array#indexOf
        this._options.activateInLayouts = this._options.activateInLayouts.toString();

        this._dims = null;  // force a recalculation of the dimensions later

        this._options.offsetTop = parseInt(this._options.offsetTop, 10) || 0;
        this._options.offsetBottom = parseInt(this._options.offsetBottom, 10) || 0;

        if (this._options.topElement) {
            this._options.topElement = Common.elOrSelector(this._options.topElement, 'Top Element');
        }
        if (this._options.bottomElement) {
            this._options.bottomElement = Common.elOrSelector(this._options.bottomElement, 'Sticky bottom Element');
        }

        this._wrapper = Element.create('div', { className: this._options.wrapperClass });
        Element.wrap(this._rootElement, this._wrapper);

        this._init();
    };

    Sticky.prototype = {

        /**
         * Init function called by the constructor
         *
         * @method _init
         * @private
         */
        _init: function() {
            var scrollTarget = document.addEventListener ? document : window;
            this._onScroll = Ink.bind(Event.throttle(this._onScroll, 33), this);  // Because this is called directly.
            Event.observe( scrollTarget, 'scroll', this._onScroll );
            Event.observe( window, 'resize', Ink.bindEvent(Event.throttle(this._onResize, 100), this) );
            this._onScroll();
            Common.registerInstance(this, this._rootElement);
        },

        /**
         * Returns whether the sticky is disabled in the current view
         *
         * @method isDisabledInLayout
         * @private
         */
        _isDisabledInLayout: function () {
            var currentLayout = Common.currentLayout();
            if (!currentLayout) { return false; }
            return this._options.activateInLayouts.indexOf(currentLayout) === -1;
        },

        /**
         * Scroll handler.
         *
         * @method _onScroll
         * @private
         */
        _onScroll: function(){
            var dims = this._getDims();
            var scrollHeight = Element.scrollHeight();

            var unstick = this._isDisabledInLayout() ||
                scrollHeight <= dims.top - this._options.offsetTop ||
                (this._options.topElement && this._options.topElement.getBoundingClientRect().bottom + this._options.offsetTop > 0);

            if( unstick ) {
                // We're on top, no sticking. position:static is the "normal" position.
                this._unstick();
                return;
            }

            // If we stick it now, what will be its boundingClientRect.bottom ?
            var bottomOfSticky = this._options.offsetTop + dims.height + Element.scrollHeight();
            var maxBottomOfSticky = document.body.scrollHeight;

            if (this._options.bottomElement) {
                maxBottomOfSticky =
                    this._options.bottomElement.getBoundingClientRect().top +
                    Element.scrollHeight();
            }

            maxBottomOfSticky -= this._options.offsetBottom;

            if ( bottomOfSticky < maxBottomOfSticky ) {
                // Stick to screen!
                this._stickTo('screen');
            } else {
                // Stick to bottom
                this._stickTo('bottom');
            }
        },

        /**
         * Have the sticky stick nowhere, to the screen, or to the bottom.
         *
         * @method _stickTo
         * @private
         */
        _stickTo: function (where) {
            var style = this._rootElement.style;
            var dims = this._getDims();

            Css.addClassName(this._rootElement, this._options.stickyClass);
            this._wrapper.style.height = dims.height + 'px';

            this._inlineDimensions(dims.height + 'px', dims.width + 'px');

            if (this._options.inlinePosition === false) {
                return;
            }

            style.left = dims.left + 'px';

            if (where === 'screen') {
                style.bottom = null;
                style.top = this._options.offsetTop + 'px';
            } else if (where === 'bottom') {
                // Distance between bottom of sticky and bottom of document
                var bottom = this._getBottomOffset();

                // Distance between bottom of viewport and bottom of document
                var bottomOfViewport = Element.scrollHeight() + Element.viewportHeight();
                var toBottomOfDocument = Element.pageHeight() - bottomOfViewport;

                style.bottom = bottom - toBottomOfDocument + 'px';
                style.top = 'auto';
            }
        },

        /**
         * "unstick" the sticky from the screen or bottom of the document
         * @method _unstick
         * @private
         */
        _unstick: function () {
            Css.removeClassName(this._rootElement, this._options.stickyClass);
            // deinline dimensions of our root element
            this._inlineDimensions(null, null);

            // deinline the position of our root element
            if (this._options.inlinePosition) {
                this._rootElement.style.left = null;
                this._rootElement.style.top = null;
                this._rootElement.style.bottom = null;
            }

            // deinline dimensions of wrapper
            this._wrapper.style.height = null;
            this._wrapper.style.width = null;

            // Break the "getDims" cache
            this._dims = null;
        },

        /**
         * Resize handler
         *
         * @method _onResize
         * @private
         */
        _onResize: function(){
            this._dims = null;  // Blow the cache so _getDims recalculates
            this._onScroll();
        },

        /**
         * Recalculate the "dims" cache, or get it.
         *
         * The "dims" cache is to be set to null when the element is liable to have changed dimensions
         *
         * (eg: on resize)
         *
         **/
        _getDims: function () {
            if (this._dims !== null) { return this._dims; }

            var style = this._rootElement.style;

            // We unstick the sticky so we can measure.
            var oldPosition = style.position;
            var oldWidth = style.width;

            style.position = 'static'; // [todo] this should be a class toggle
            style.width = null;

            var dimensionsInStatic = Element.outerDimensions(this._rootElement);
            var rect = this._wrapper.getBoundingClientRect();
            this._dims = {
                height: dimensionsInStatic[1],
                width: dimensionsInStatic[0],
                left: rect.left + Element.scrollWidth(),
                top: rect.top + Element.scrollHeight()
            };

            style.position = oldPosition;
            style.width = oldWidth;

            return this._dims;
        },

        /**
         * Set style.height and style.width, but not if options.inlineDimensions === false
         *
         * @method _inlineDimensions
         * @private
         */
        _inlineDimensions: function (height, width) {
            if (this._options.inlineDimensions) {
                this._rootElement.style.height = height;
                this._rootElement.style.width = width;
            }
        },

        /**
         * Get the distance between the bottom of the element and the bottom of the page
         *
         * @method _getBottomOffset
         * @private
         */
        _getBottomOffset: function () {
            var bottom = this._options.offsetBottom;
            if (this._options.bottomElement) {
                bottom += Element.pageHeight() -
                    Element.offsetTop(this._options.bottomElement);
            }
            return bottom;
        }
    };

    return Sticky;

});

/**
 * Swipe gestures
 * @module Ink.UI.Swipe_1
 * @version 1
 */
Ink.createModule('Ink.UI.Swipe', '1', ['Ink.Dom.Event_1', 'Ink.Dom.Element_1', 'Ink.UI.Common_1'], function(InkEvent, InkElement, Common) {
    'use strict';

    /**
     * Subscribe swipe gestures.
     *
     * Supports filtering swipes be any combination of the criteria supported in the options.
     *
     * @class Ink.UI.Swipe_1
     * @constructor
     * @param {String|DOMElement}   el                      Element or Selector
     * @param {Object}              options                 Options Object
     * @param {Function}            [options.onEnd]         Callback function for the `touchend` event. Gets all the gesture information, and is filtered by min/max Dist and Duration options (see below)
     * @param {Function}            [options.onStart]       Callback function for `touchstart` event.
     * @param {Function}            [options.onMove]        Callback function for every `touchmove` event. Gets current gesture information.
     * @param {Number}              [options.minDist]       Minimum allowed distance, in pixels.
     * @param {Number}              [options.maxDist]       Maximum allowed distance, in pixels.
     * @param {Number}              [options.minDuration]   Minimum allowed duration, in seconds.
     * @param {Number}              [options.maxDuration]   Maximum allowed duration, in seconds.
     * @param {String}              [options.axis]          If either 'x' or 'y' is passed, only swipes where the dominant axis is the given one trigger the callback
     * @param {String}              [options.storeGesture]  If to store gesture information and provide it to the callback. Defaults to true.
     * @param {String}              [options.stopEvents]    Flag to stop (default and propagation) of the received events. Defaults to true.
     * 
     * -----
     *
     * Arguments received by the callbacks
     * -----------------------------------
     *
     * `onStart`, `onMove`, and `onEnd` receive as argument an object containing:
     *
     *   - `event`: the DOMEvent object
     *   - `element`: the target element
     *   - `Instance`: the `Ink.UI.Swipe_1` instance
     *   - `position`: `Array` with `[x, y]` coordinates of current position
     *   - `dt`: Time passed between now and the first event (onMove only)
     *   - `gesture`: an Array containing [x,y] coordinates of every touchmove event received (storeGesture only) (onEnd only)
     *   - `time`: an Array containing all the `dt` values for every touchmove event (onEnd only)
     *   - `overallMovement`: X and Y distance traveled by the touch movement (`[x, y]`) (onEnd only)
     *   - `overallTime`: total time passed (onEnd only)
     *
     * @sample Ink_UI_Swipe_1.html
     */
    function Swipe(el, options) {
        el = Common.elOrSelector(el, 'Swipe target');

        this._options = Ink.extendObj({
            onEnd:          undefined,
            onStart:        undefined,
            onMove:         undefined,
            minDist:        undefined,      // in pixels
            maxDist:        undefined,
            minDuration:    undefined,      // in seconds
            maxDuration:    undefined,
            axis:           undefined,       // x | y
            storeGesture:   false,
            stopEvents:     true
        }, InkElement.data(el), options || {});

        if (typeof options === 'function') {
            this._options.onEnd = options;
        }

        this._handlers = {
            down: Ink.bindEvent(this._onDown, this),
            move: Ink.bindEvent(this._onMove, this),
            up:   Ink.bindEvent(this._onUp, this)
        };

        this._element = el;

        this._init();
    }

    Swipe.prototype = {

        version: '0.1',

        _supported: ('ontouchstart' in document.documentElement),

        _init: function() {
            var db = document.body;
            InkEvent.observe(db, 'touchstart', this._handlers.down);
            if (this._options.storeGesture || this._options.onMove) {
                InkEvent.observe(db, 'touchmove', this._handlers.move);
            }
            InkEvent.observe(db, 'touchend', this._handlers.up);
            this._isOn = false;

            Common.registerInstance(this, this._element);
        },

        _isMeOrParent: function(el, parentEl) {
            if (!el) {return;}
            do {
                if (el === parentEl) { return true; }
                el = el.parentNode;
            } while (el);
            return false;
        },

        _pushGesture: function (coords, dt) {
            if (this._options.storeGesture) {
                this._gesture.push(coords);
                this._time.push(dt);
            }
        },

        _onDown: function(event) {
            if (event.changedTouches.length !== 1) { return; }
            if (!this._isMeOrParent(event.target, this._element)) { return; }

            if( this._options.stopEvents === true ){
                InkEvent.stop(event);
            }
            event = event.changedTouches[0];
            this._isOn = true;
            this._target = event.target;

            this._t0 = +new Date();
            this._p0 = [event.pageX, event.pageY];

            if (this._options.storeGesture) {
                this._gesture = [];
                this._time    = [];
            }

            this._pushGesture(this._p0, 0);

            if (this._options.onStart) {
                this._options.onStart({
                    event: event,
                    element: this._element,
                    instance: this,
                    position: this._p0,
                    dt: 0
                });
            }
        },

        _onMove: function(event) {
            if (!this._isOn || event.changedTouches.length !== 1) { return; }
            if( this._options.stopEvents === true ) {
                InkEvent.stop(event);
            }

            event = event.changedTouches[0];
            var t1 = +new Date();
            var dt = (t1 - this._t0);

            var gesture = [event.pageX, event.pageY];

            this._pushGesture(gesture, dt);

            if (this._options.onMove) {
                this._options.onMove({
                    event: event,
                    element: this._element,
                    instance: this,
                    position: gesture,
                    dt: dt
                });
            }
        },

        _onUp: function(event) {
            if (!this._isOn || event.changedTouches.length !== 1) { return; }

            if( this._options.stopEvents === true ){
                InkEvent.stop(event);
            }
            event = event.changedTouches[0];   // TODO SHOULD CHECK IT IS THE SAME TOUCH
            this._isOn = false;

            var t1 = +new Date();
            var p1 = [event.pageX, event.pageY];
            var dt = (t1 - this._t0);
            var dr = [
                p1[0] - this._p0[0],
                p1[1] - this._p0[1]
            ];
            var dist = Math.sqrt(dr[0]*dr[0] + dr[1]*dr[1]);
            var axis = Math.abs(dr[0]) > Math.abs(dr[1]) ? 'x' : 'y';

            var o = this._options;
            if (o.minDist     && dist <   o.minDist) {     return; }
            if (o.maxDist     && dist >   o.maxDist) {     return; }
            if (o.minDuration && dt   <   o.minDuration) { return; }
            if (o.maxDuration && dt   >   o.maxDuration) { return; }
            if (o.axis        && axis !== o.axis)    {     return; }

            if (this._options.onEnd) {
                this._options.onEnd({
                    event: event,
                    element: this._element,
                    instance: this,
                    gesture: this._gesture,
                    time: this._time,
                    axis: axis,
                    overallMovement: dr,
                    overallTime: dt
                });
            }
        }
    };

    return Swipe;
});

/**
 * Sort and paginate tabular data
 * @module Ink.UI.Table_1
 * @version 1
 */
Ink.createModule('Ink.UI.Table', '1', ['Ink.Util.Url_1','Ink.UI.Pagination_1','Ink.Net.Ajax_1','Ink.UI.Common_1','Ink.Dom.Event_1','Ink.Dom.Css_1','Ink.Dom.Element_1','Ink.Dom.Selector_1','Ink.Util.Array_1','Ink.Util.String_1', 'Ink.Util.Json_1'], function(InkUrl,Pagination, Ajax, Common, Event, Css, Element, Selector, InkArray, InkString, Json) {
    'use strict';

    var rNumber = /\d/g;
    // Turn into a number, if we can. For sorting data which could be numeric or not.
    function maybeTurnIntoNumber(value) {
        if( !isNaN(value) && rNumber.test(value) ){
            return parseInt(value, 10);
        } else if( !isNaN(value) ){
            return parseFloat(value);
        }
        return value;
    }
    function cmp (a, b) {
        if( a === b ){
            return 0;
        }
        return ( ( a > b ) ? 1 : -1 );
    }
    // cmp function for comparing data which might be a number.
    function numberishEnabledCmp (a, b) {
        var aValue = maybeTurnIntoNumber(Element.textContent(a));
        var bValue = maybeTurnIntoNumber(Element.textContent(b));

        return cmp(aValue, bValue);
    }
    // Object.keys polyfill
    function keys(obj) {
        if (typeof Object.keys !== 'undefined') {
            return Object.keys(obj);
        }
        var ret = [];
        for (var k in obj) if (obj.hasOwnProperty(k)) {
            ret.push(k);
        }
        return ret;
    }

    // Most processJSON* functions can just default to this.
    function sameSame(obj) { return obj; }
    /**
     * The Table component transforms the native/DOM table element into a sortable, paginated component.
     * You can use this component to display data from a JSON endpoint, or from table rows in the DOM. Displaying from the DOM is more practical, but sometimes you don't want to load everything at once (if you have a HUGE table). In those cases, you should configure Ink.UI.Table to get data from JSON endpoint.
     * To enable sorting, just set the `data-sortable` attribute of your table headers (they must be in the `thead` of the table) to "true". To enable pagination, you should pass either an `Ink.UI.Pagination` instance or a selector to create the Ink.UI.Pagination element on.
     *
     * @class Ink.UI.Table
     * @constructor
     * @version 1
     * @param {String|DOMElement}   selector
     * @param {Object}              [options] Options
     * @param {Number}              [options.pageSize]                      Number of rows per page. Omit to avoid paginating.
     * @param {String}              [options.endpoint]                      Endpoint to get the records via AJAX. Omit if you don't want to do AJAX
     * @param {Function}            [options.createEndpointUrl]             Callback to customise what URL the AJAX endpoint is at. Receives three arguments: base (the "endpoint" option), sort (`{ order: 'asc' or 'desc', field: fieldname }`) and page ({ page: page number, size: items per page })
     * @param {Function}            [options.getDataFromEndPoint]           Callback to allow the user to retrieve the data himself given an URL.  Must accept two arguments: `url` and `callback`. This `callback` will take as a single argument a JavaScript object.
     * @param {Function}            [options.processJSONRows]               Retrieve an array of rows from the data which came from AJAX.
     * @param {Function}            [options.processJSONHeaders]            Get an object with all the headers' names as keys, and a { label, sortable } object as value.  Example: `{col1: {label: "Column 1"}, col2: {label: "Column 2", sortable: true}`.  Takes a single argument, the JSON response.
     * @param {Function}            [options.processJSONRow]                Process a row object before it gets on the table.
     * @param {Function}            [options.processJSONField]              Process the field data before putting it on the table.  You can return HTML, a DOM element, or a string here.  Arguments you receive: `(column, fieldData, rowIndex)`.
     * @param {Function}            [options.processJSONField.FIELD_NAME]   The same as processJSONField, but for a particular field.
     * @param {Function}            [options.processJSONTotalRows]          A callback where you have a chance to say how many rows are in the dataset (not only on this page) you have on the collection. You get as an argument the JSON response.
     * @param {Function}            [options.getSortKey]                    A function taking a `{ columnIndex, columnName, data, element }` object and returning a value which serves as a sort key for the sorting operation. For example, if you want to sort by a `data-sort-key` atribute, set `getSortKey` to: function (cell) { return cell.element.getAttribute('data-sort-key'); }
     * @param {Function}            [options.getSortKey.FIELD_NAME]         Same as `options.getSortKey`, but for a particular field.
     * @param {Object}              [options.tdClassNames]                  An object mapping each field to what classes it gets.  Example: `{ name: "large-10", isBoss: "hide-small" }`
     * @param {Mixed}               [options.pagination]                    Pagination instance, element or selector.
     * @param {Object}              [options.paginationOptions]             Override the options with which we instantiate the Ink.UI.Pagination.
     * @param {Boolean}             [options.allowResetSorting]             Allow sort order to be set to "none" in addition to "ascending" and "descending"
     * @param {String|Array}        [options.visibleFields]                 Set of fields which get shown on the table
     *
     * @sample Ink_UI_Table_1.html
     */
    var Table = function( selector, options ){

        /**
         * Get the root element
         */
        this._rootElement = Common.elOrSelector(selector, 'Ink.UI.Table :');

        if( this._rootElement.nodeName.toLowerCase() !== 'table' ){
            throw new Error('[Ink.UI.Table] :: The element is not a table');
        }

        this._options = Common.options({
            pageSize: ['Integer', null],
            caretUpClass: ['String', 'fa fa-caret-up'],
            caretDownClass: ['String', 'fa fa-caret-down'],
            endpoint: ['String', null],
            createEndpointUrl: ['Function', null /* default func uses above option */],
            getDataFromEndPoint: ['Function', null /* by default use plain ajax for JSON */],
            processJSONRows: ['Function', sameSame],
            processJSONRow: ['Function', sameSame],
            processJSONField: ['Function', sameSame],
            processJSONHeaders: ['Function', function (dt) { return dt.fields; }],
            processJSONTotalRows: ['Function', function (dt) { return dt.length || dt.totalRows; }],
            getSortKey: ['Function', null],
            pagination: ['Element', null],
            allowResetSorting: ['Boolean', false],
            visibleFields: ['String', null],
            tdClassNames: ['Object', {}],
            paginationOptions: ['Object', null]
        }, options || {}, this._rootElement);

        /**
         * Checking if it's in markup mode or endpoint mode
         */
        this._markupMode = !this._options.endpoint;

        if( this._options.visibleFields ){
            this._options.visibleFields = this._options.visibleFields.toString().split(/[, ]+/g);
        }

        this._thead = this._rootElement.tHead || this._rootElement.createTHead();
        this._headers = Selector.select('th', this._thead);

        /**
         * Initializing variables
         */
        this._handlers = {
            thClick: null
        };
        this._originalFields = [
            // field headers from the DOM
        ];
        this._sortableFields = {
            // Identifies which columns are sorted and how.
            // columnIndex: 'none'|'asc'|'desc'
        };
        this._originalData = this._data = [];
        this._pagination = null;
        this._totalRows = 0;

        this._handlers.thClick = Event.observeDelegated(this._rootElement, 'click',
                'thead th[data-sortable="true"]',
                Ink.bindMethod(this, '_onThClick'));

        this._init();
    };

    Table.prototype = {

        /**
         * Init function called by the constructor
         * 
         * @method _init
         * @private
         */
        _init: function(){
            /**
             * If not is in markup mode, we have to do the initial request
             * to get the first data and the headers
             */
            if( !this._markupMode ) {
                /* Endpoint mode */
                this._getData(  );
            } else /* Markup mode */ {
                this._resetSortOrder();
                this._addHeadersClasses();

                /**
                 * Getting the table's data
                 */
                this._data = Selector.select('tbody tr', this._rootElement);
                this._originalData = this._data.slice(0);

                this._totalRows = this._data.length;

                /**
                 * Set pagination if options tell us to
                 */
                this._setPagination();
            }
        },

        /**
         * Add the classes in this._options.tdClassNames to our table headers.
         * @method _addHeadersClasses
         * @private
         */
        _addHeadersClasses: function () {
            var headerLabel;
            var classNames;
            for (var i = 0, len = this._headers.length; i < len; i++) {
                headerLabel = Element.textContent(this._headers[i]);
                classNames = this._options.tdClassNames[headerLabel];
                // TODO do not find header labels this way. But how?
                if (classNames) {
                    Css.addClassName(this._headers[i], classNames);
                }
            }
        },

        /**
         * Click handler. This will mainly handle the sorting (when you click in the headers)
         * 
         * @method _onThClick
         * @param {Event} event Event obj
         * @private
         */
        _onThClick: function( event ){
            var tgtEl = Event.element(event),
                paginated = this._options.pageSize !== undefined;

            Event.stop(event);

            var index = InkArray.keyValue(tgtEl, this._headers, true);
            var sortable = index !== false && this._sortableFields[index] !== undefined;

            if( !sortable ){
                return;
            }

            if( !this._markupMode && paginated ){
                this._invertSortOrder(index, false);
            } else {
                if ( (this._sortableFields[index] === 'desc') && this._options.allowResetSorting ) {
                    this._setSortOrderOfColumn(index, null);
                    this._data = this._originalData.slice(0);
                } else {
                    this._invertSortOrder(index, true);
                }

                var tbody = Selector.select('tbody',this._rootElement)[0];
                Common.cleanChildren(tbody);
                InkArray.each(this._data, Ink.bindMethod(tbody, 'appendChild'));

                if (this._pagination) {
                    this._pagination.setCurrent(0);
                    this._paginate(1);
                }
            }
        },

        _invertSortOrder: function (index, sortAndReverse) {
            var isAscending = this._sortableFields[index] === 'asc';

            for (var i = 0, len = this._headers.length; i < len; i++) {
                this._setSortOrderOfColumn(i, null);
            }

            if (sortAndReverse) {
                this._sort(index);
                if (isAscending) {
                    this._data.reverse();
                }
            }

            this._setSortOrderOfColumn(index, !isAscending);
        },

        _setSortOrderOfColumn: function(index, up) {
            var header = this._headers[index];
            var caretHtml = [''];
            var order = 'none';

            if (up === true) {
                caretHtml = ['<i class="', this._options.caretUpClass, '"></i>'];
                order = 'asc';
            } else if (up === false) {
                caretHtml = ['<i class="', this._options.caretDownClass, '"></i>'];
                order = 'desc';
            }

            this._sortableFields[index] = order;
            header.innerHTML = Element.textContent(header) + caretHtml.join('');
        },

        /**
         * Applies and/or changes the CSS classes in order to show the right columns
         * 
         * @method _paginate
         * @param {Number} page Current page
         * @private
         */
        _paginate: function( page ){
            if (!this._pagination) { return; }

            var pageSize = this._options.pageSize;

            // Hide everything except the items between these indices
            var firstIndex = (page - 1) * pageSize;
            var lastIndex = firstIndex + pageSize;

            InkArray.each(this._data, function(item, index){
                if (index >= firstIndex && index < lastIndex) {
                    Css.removeClassName(item,'hide-all');
                } else {
                    Css.addClassName(item,'hide-all');
                }
            });

        },

        /* register fields into this._originalFields, whether they come from JSON or a table.
         * @method _registerFieldNames
         * @private
         * @param [names] The field names in an array
         **/
        _registerFieldNames: function (names) {
            this._originalFields = [];

            InkArray.forEach(names, Ink.bind(function (field) {
                if( !this._fieldIsVisible(field) ){
                    return;  // The user deems this not to be necessary to see.
                }
                this._originalFields.push(field);
            }, this));
        },

        _fieldIsVisible: function (field) {
            return !this._options.visibleFields ||
                (this._options.visibleFields.indexOf(field) !== -1);
        },

        /**
         * Sorts by a specific column.
         * 
         * @method _sort
         * @param {Number} index Column number (starting at 0)
         * @private
         */
        _sort: function( index ){
            // TODO this is THE worst way to declare field names. Incompatible with i18n and a lot of other things.
            var fieldName = Element.textContent(this._headers[index]);
            var keyFunction = this._options.getSortKey;

            if (keyFunction) {
                keyFunction =
                    typeof keyFunction[fieldName] === 'function' ?
                        keyFunction[fieldName] :
                    typeof keyFunction === 'function' ?
                        keyFunction :
                        null;
            }

            var self = this;

            this._data.sort(function (trA, trB) {
                var elementA = Ink.ss('td', trA)[index];
                var elementB = Ink.ss('td', trB)[index];
                if (keyFunction) {
                    return cmp(userKey(elementA), userKey(elementB));
                } else {
                    return numberishEnabledCmp(elementA, elementB, index);
                }
            });

            function userKey(element) {
                return keyFunction.call(self, {
                    columnIndex: index,
                    columnName: fieldName,
                    data: Element.textContent(element),
                    element: element
                });
            }
        },

        /**
         * Assembles the headers markup
         *
         * @method _createHeadersFromJson
         * @param  {Object} headers Key-value object that contains the fields as keys, their configuration (label and sorting ability) as value
         * @private
         */
        _createHeadersFromJson: function( headers ){
            this._registerFieldNames(keys(headers));

            if (this._thead.children.length) { return; }

            var tr = this._thead.insertRow(0);
            var th;

            for (var i = 0, len = headers.length; i < len; i++) {
                if (this._fieldIsVisible(headers[i])) {
                    th = Element.create('th');
                    th = this._createSingleHeaderFromJson(headers[i], th);
                    tr.appendChild(th);
                    this._headers.push(th);
                }
            }
        },

        _createSingleHeaderFromJson: function (header, th) {
            if (header.sortable) {
                th.setAttribute('data-sortable','true');
            }

            if (header.label){
                Element.setTextContent(th, header.label);
            }

            return th;
        },

        /**
         * Reset the sort order as marked on the table headers to "none"
         *
         * @method _resetSortOrder
         * @private
         */
        _resetSortOrder: function(){
            /**
             * Setting the sortable columns and its event listeners
             */
            for (var i = 0, len = this._headers.length; i < len; i++) {
                var dataset = Element.data( this._headers[i] );
                if (dataset.sortable && dataset.sortable.toString() === 'true') {
                    this._sortableFields[i] = 'none';
                }
            }
        },

        /**
         * This method gets the rows from AJAX and places them as <tr> and <td>
         *
         * @method _createRowsFromJSON
         * @param  {Object} rows Array of objects with the data to be showed
         * @private
         */
        _createRowsFromJSON: function( rows ){
            var tbody = Selector.select('tbody',this._rootElement)[0];

            if( !tbody ){
                tbody = document.createElement('tbody');
                this._rootElement.appendChild( tbody );
            } else {
                Element.setHTML(tbody, '');
            }

            this._data = [];
            var row;

            for (var trIndex in rows) {
                if (rows.hasOwnProperty(trIndex)) {
                    row = this._options.processJSONRow(rows[trIndex]);
                    this._createSingleRowFromJson(tbody, row, trIndex);
                }
            }

            this._originalData = this._data.slice(0);
        },

        _createSingleRowFromJson: function (tbody, row, rowIndex) {
            var tr = document.createElement('tr');
            tbody.appendChild( tr );
            for( var field in row ){
                if (row.hasOwnProperty(field)) {
                    this._createFieldFromJson(tr, row[field], field, rowIndex);
                }
            }
            this._data.push(tr);
        },

        _createFieldFromJson: function (tr, fieldData, fieldName, rowIndex) {
            if (!this._fieldIsVisible(fieldName)) { return; }

            var processor =
                this._options.processJSONField[fieldName] ||  // per-field callback
                this._options.processJSONField;  // generic callback

            var result;
            if (typeof processor === 'function') {
                result = processor(fieldData, fieldName, rowIndex);
            } else {
                result = fieldData;
            }
            var elm = this._elOrFieldData(result);

            var className = this._options.tdClassNames[fieldName];
            if (className) {
                Css.addClassName(elm, className);
            }

            tr.appendChild(elm);
        },

        _elOrFieldData: function (processed) {
            if (Common.isDOMElement(processed)) {
                return processed;
            }

            var isString = typeof processed === 'string';
            var isNumber = typeof processed === 'number';
            var elm = Element.create('td');

            if (isString && /^\s*?</.test(processed)) {
                Element.setHTML(elm, processed);
            } else if (isString || isNumber) {
                Element.setTextContent(elm, processed);
            } else {
                throw new Error('Ink.UI.Table Unknown result from processJSONField: ' + processed);
            }

            return elm;
        },

        /**
         * Sets the AJAX endpoint.
         * Useful to change the endpoint in runtime.
         *
         * @method setEndpoint
         * @public
         * @param {String} endpoint New endpoint
         */
        setEndpoint: function( endpoint, currentPage ){
            if( !this._markupMode ){
                this._options.endpoint = endpoint;
                if (this._pagination) {
                    this._pagination.setCurrent((!!currentPage) ? parseInt(currentPage,10) : 0 );
                }
            }
        },

        /**
         * Sets the instance's pagination, if necessary.
         *
         * Precondition: this._totalRows needs to be known.
         *
         * @method _setPagination
         * @private
         */
        _setPagination: function(){
            /* If user doesn't say they want pagination, bail. */
            if( this._options.pageSize == null ){ return; }

            /**
             * Fetch pagination from options. Can be a selector string, an element or a Pagination instance.
             */
            var paginationEl = this._options.pagination;

            if ( paginationEl instanceof Pagination ) {
                this._pagination = paginationEl;
                return;
            }

            if (!paginationEl) {
                paginationEl = Element.create('nav', {
                    className: 'ink-navigation',
                    insertAfter: this._rootElement
                });
                Element.create('ul', {
                    className: 'pagination',
                    insertBottom: paginationEl
                });
            }

            var paginationOptions = Ink.extendObj({
                totalItemCount: this._totalRows,
                itemsPerPage: this._options.pageSize,
                onChange: Ink.bind(function (_, pageNo) {
                    this._paginate(pageNo + 1);
                }, this)
            }, this._options.paginationOptions || {});

            this._pagination = new Pagination(paginationEl, paginationOptions);

            this._paginate(1);
        },

        /**
         * Method to choose which is the best way to get the data based on the endpoint:
         *     - AJAX
         *     - JSONP
         *
         * @method _getData
         * @private
         */
        _getData: function( ){
            var sortOrder = this._getSortOrder() || null;
            var page = null;

            if (this._pagination) {
                page = {
                    size: this._options.pageSize,
                    page: this._pagination.getCurrent() + 1
                };
            }

            this._getDataViaAjax( this._getUrl( sortOrder, page) );
        },

        /**
         * Return an object describing sort order { field: [field name] ,
         * order: ["asc" or "desc"] }, or null if there is no sorting
         * going on.
         * @method _getSortOrder
         * @private
         */
        _getSortOrder: function () {
            var index;
            for (index in this._sortableFields) if (this._sortableFields.hasOwnProperty(index)) {
                if( this._sortableFields[index] !== 'none' ){
                    break;
                }
            }
            if (!index) {
                return null; // no sorting going on
            }
            return {
                field: this._originalFields[index],
                order: this._sortableFields[index]
            };
        },

        _getUrl: function (sort, page) {
            var urlCreator = this._options.createEndpointUrl ||
                function (endpoint, sort, page
                        /* TODO implement filters too */) {
                    endpoint = InkUrl.parseUrl(endpoint);
                    endpoint.query = endpoint.query || {};

                    if (sort) {
                        endpoint.query.sortOrder = sort.order;
                        endpoint.query.sortField = sort.field;
                    }

                    if (page) {
                        endpoint.query['rows_per_page'] = page.size;
                        endpoint.query['page'] = page.page;
                    }

                    return InkUrl.format(endpoint);
                };

            var ret = urlCreator(this._options.endpoint, sort, page);

            if (typeof ret !== 'string') {
                throw new TypeError('Ink.UI.Table_1: ' +
                    'createEndpointUrl did not return a string!');
            }

            return ret;
        },

        /**
         * Gets the data via AJAX and calls this._onAjaxSuccess with the response.
         * 
         * Will call options.getDataFromEndpoint( Uri, callback ) if available.
         *
         * @param  endpointUri Endpoint to get data from, after processing.
         */
        _getDataViaAjax: function( endpointUri ){
            var success = Ink.bind(function( JSONData ){
                this._onAjaxSuccess( JSONData );
            }, this);

            if (!this._options.getDataFromEndpoint) {
                new Ajax( endpointUri, {
                    method: 'GET',
                    contentType: 'application/json',
                    sanitizeJSON: true,
                    onSuccess: Ink.bind(function( response ){
                        if( response.status === 200 ){
                            success(Json.parse(response.responseText));
                        }
                    }, this)
                });
            } else {
                this._options.getDataFromEndpoint( endpointUri, success );
            }
        },

        _onAjaxSuccess: function (jsonResponse) {
            var paginated = this._options.pageSize != null;
            var rows = this._options.processJSONRows(jsonResponse);
            this._headers = Selector.select('th', this._thead);

            // If headers not in DOM, get from JSON
            if( this._headers.length === 0 ) {
                var headers = this._options.processJSONHeaders(
                    jsonResponse);
                if (!headers || !headers.length || !headers[0]) {
                    throw new Error('Ink.UI.Table: processJSONHeaders option must return an array of objects!');
                }
                this._createHeadersFromJson( headers );
                this._resetSortOrder();
                this._addHeadersClasses();
            }

            this._createRowsFromJSON( rows );

            this._totalRows = this._rowLength = rows.length;

            if( paginated ){
                this._totalRows = this._options.processJSONTotalRows(jsonResponse);
                this._setPagination( );
            }
        }
    };

    return Table;

});

/**
 * Display tabbed content
 * @module Ink.UI.Tabs_1
 * @version 1
 */
Ink.createModule('Ink.UI.Tabs', '1', ['Ink.UI.Common_1','Ink.Dom.Event_1','Ink.Dom.Css_1','Ink.Dom.Element_1','Ink.Dom.Selector_1'], function(Common, Event, Css, Element, Selector) {
    'use strict';

    /**
     * The Tabs Component offers a simple way to build a tab-separated layout, allowing you to offer multiple content in the same space with intuitive navigation.
     * This component requires your markup to have:
     * - A container element (this is what you call the Ink.UI.Tabs constructor on), containing everything.
     * - An element with the `tabs-nav` class, to contain links.
     * - Your links with `href="#ID_OF_SECTION"`
     * - Your sections with the corresponding `id` attributes.
     * - The content for each section.
     *
     * When the user clicks in the links inside `tabs-nav`, the tab with the corresponding ID is then activated. The active tab when the tab component is initialized has its hash in the browser URL. If there is no hash, then the `active` option kicks in. Otherwise, Tabs will fall back to showing the tab corresponding to the first link.
     * You can disable some (or all) tabs by passing an array for the `disabled` option.
     *
     * @class Ink.UI.Tabs
     * @constructor
     * @version 1
     * @param {String|DOMElement}   selector
     * @param {Object}              [options]                       Options
     * @param {Boolean}             [options.preventUrlChange]      Flag that determines if follows the link on click or stops the event
     * @param {String}              [options.active]                ID of the tab to activate on creation
     * @param {Array}               [options.disabled]              IDs of the tabs that will be disabled on creation
     * @param {Function}            [options.onBeforeChange]        Callback to be executed before changing tabs
     * @param {Function}            [options.onChange]              Callback to be executed after changing tabs
     * @param {Boolean}             [options.triggerEventsOnLoad]   Trigger the above events when the page is loaded.
     *
     * @sample Ink_UI_Tabs_1.html
     */
    var Tabs = function(selector, options) {
        this._element = Common.elOrSelector(selector, 'Ink.UI.Tabs tab container');

        this._options = Common.options({
            preventUrlChange:   ['Boolean', false],
            active:             ['String', undefined],
            disabled:           ['Object', []],
            onBeforeChange:     ['Function', undefined],
            onChange:           ['Function', undefined],
            triggerEventsOnLoad:['Boolean', true]
        }, options || {}, this._element, 'Ink.UI.Tabs_1');

        this._handlers = {
            tabClicked: Ink.bindEvent(this._onTabClicked,this),
            disabledTabClicked: Ink.bindEvent(this._onDisabledTabClicked,this),
            resize: Ink.bindEvent(Event.throttle(this._onResize, 100),this)
        };

        this._init();
    };

    Tabs.prototype = {

        /**
         * Init function called by the constructor
         * 
         * @method _init
         * @private
         */
        _init: function() {
            this._menu = Selector.select('.tabs-nav', this._element)[0];
            if (!this._menu) {
                Ink.warn('Ink.UI.Tabs: An element selected by ".tabs-nav" needs to exist inside the element!');
                return;
            }
            this._contentTabs = Selector.select('.tabs-content', this._element);

            //initialization of the tabs, hides all content before setting the active tab
            this._initializeDom();

            // subscribe events
            this._observe();

            //sets the first active tab
            this._setFirstActive();

            this._handlers.resize();

            Common.registerInstance(this, this._element, 'Tabs');
        },

        /**
         * Initialization of the tabs, hides all content before setting the active tab
         * 
         * @method _initializeDom
         * @private
         */
        _initializeDom: function(){
            var contentTabs = Selector.select('.tabs-content', this._element);

            for(var i = 0; i < contentTabs.length; i++){
                Css.addClassName(contentTabs[i], 'hide-all');
            }
        },

        /**
         * Subscribe events
         * 
         * @method _observe
         * @private
         */
        _observe: function() {
            Event.on(this._menu, 'click', '> *', Ink.bindMethod(this, '_onTabClickedGeneric'));
            Event.observe(window, 'resize', this._handlers.resize);
        },

        /**
         * Run at instantiation, to determine which is the first active tab
         * fallsback from window.location.href to options.active to the first not disabled tab
         * 
         * @method _setFirstActive
         * @private
         */
        _setFirstActive: function() {
            var hash = window.location.hash;

            var activeMenuLink = this._findLinkByHref(hash) ||
                                 (this._options.active && this._findLinkByHref(this._options.active)) ||
                                 Selector.select('a', this._menu)[0];

            this._changeTab(activeMenuLink, this._options.triggerEventsOnLoad);
        },

        /**
         * Changes to the desired tab
         * 
         * @method _changeTab
         * @param {DOMElement} link             anchor linking to the content container
         * @param {boolean}    runCallbacks     defines if the callbacks should be run or not
         * @private
         */
        _changeTab: function(link, runCallbacks){
            if(runCallbacks && typeof this._options.onBeforeChange !== 'undefined'){
                this._options.onBeforeChange(this);
            }

            var selector = link.getAttribute('href');
            if (this._activeMenuTab) {
                Css.removeClassName(this._activeMenuTab, 'active');
                Css.removeClassName(this._activeContentTab, 'active');
                Css.addClassName(this._activeContentTab, 'hide-all');
            }

            this._activeMenuLink = link;
            this._activeMenuTab = this._activeMenuLink.parentNode;
            this._activeContentTab = Selector.select(selector.substr(selector.indexOf('#')), this._element)[0];

            if (!this._activeContentTab) {
                this._activeMenuLink = this._activeMenuTab = this._activeContentTab = null;
                return;
            }

            Css.addClassName(this._activeMenuTab, 'active');
            Css.addClassName(this._activeContentTab, 'active');
            Css.removeClassName(this._activeContentTab, 'hide-all');

            if(runCallbacks && typeof(this._options.onChange) !== 'undefined'){
                this._options.onChange(this);
            }
        },

        /**
         * Generic Tab clicked handler.
         * Just calls _onTabClicked or _onDisabledTabClicked
         *
         * @private
         **/
        _onTabClickedGeneric: function (event) {
            if (!Css.hasClassName(event.currentTarget, 'ink-disabled')) {
                this._onTabClicked(event);
            } else {
                this._onDisabledTabClicked(event);
            }
        },

        /**
         * Tab clicked handler
         * 
         * @method _onTabClicked
         * @param {Event} ev
         * @private
         */
        _onTabClicked: function(ev) {
            Event.stop(ev);

            var target = Event.findElement(ev, 'A');
            if(!target || target.nodeName.toLowerCase() !== 'a') {
                return;
            }

            var href = target.getAttribute('href').substr(target.getAttribute('href').indexOf('#'));

            if (!href || Ink.i(href.replace(/^#/, '')) === null) {
                return;
            }

            if (this._options.preventUrlChange.toString() !== 'true') {
                window.location.hash = href;
            }

            if (target === this._activeMenuLink) {
                return;
            }
            this.changeTab(target);
        },

        /**
         * Disabled tab clicked handler
         * 
         * @method _onDisabledTabClicked
         * @param {Event} ev
         * @private
         */
        _onDisabledTabClicked: function(ev) {
            Event.stop(ev);
        },

        /**
         * Resize handler
         * 
         * @method _onResize
         * @private
         */
        _onResize: function(){
            var currentLayout = Common.currentLayout();
            if(currentLayout === this._lastLayout){
                return;
            }

            // wtf
            var smallLayout =
                currentLayout === Common.Layouts.TINY ||
                currentLayout === Common.Layouts.SMALL ||
                currentLayout === Common.Layouts.MEDIUM;

            if(smallLayout){
                Css.removeClassName(this._menu, 'menu');
                Css.removeClassName(this._menu, 'horizontal');
                // Css.addClassName(this._menu, 'pills');
            } else {
                Css.addClassName(this._menu, 'menu');
                Css.addClassName(this._menu, 'horizontal');
                // Css.removeClassName(this._menu, 'pills');
            }
            this._lastLayout = currentLayout;
        },

        /*****************
         * Aux Functions *
         *****************/

        /**
         * Allows the hash to be passed with or without the cardinal sign
         * 
         * @method _hashify
         * @param {String} hash     the string to be hashified
         * @return {String} Resulting hash
         * @private
         */
        _hashify: function(hash){
            if(!hash){
                return "";
            }
            return hash.indexOf('#') === 0? hash : '#' + hash;
        },

        /**
         * Returns the anchor with the desired href
         * 
         * @method _findLinkBuHref
         * @param {String} href     the href to be found on the returned link
         * @return {String|undefined} [description]
         * @private
         */
        _findLinkByHref: function(href){
            href = this._hashify(href);

            // Find a link which has a href ending with...
            return Selector.select('a[href$="' + href + '"]', this._menu)[0];
        },

        /**************
         * PUBLIC API *
         **************/

        /**
         * Changes the active tab
         *
         * Pass a selector/element identifying what tab you want
         * 
         * @method changeTab
         * @param {String|DOMElement} selector      Selector of the desired tab or the link that links to it
         * @public
         */
        changeTab: function(selector) {
            var element = (selector.nodeType === 1)? selector : this._findLinkByHref(this._hashify(selector));
            if(!element || Css.hasClassName(element, 'ink-disabled')){
                return;
            }
            this._changeTab(element, true);
        },

        /**
         * The enable() and disable() functions do exactly the same thing.
         * one adds the className and the other removes it.
         **/
        _enableOrDisableDRY: function (selector, isEnable) {
            var element = (selector.nodeType === 1)? selector : this._findLinkByHref(this._hashify(selector));
            if(!element){
                return;
            }
            Css.setClassName(element, 'ink-disabled', !isEnable);
        },

        /**
         * Disables the desired tag
         * 
         * @method disable
         * @param {String|DOMElement} selector      the id of the desired tab or the link that links to it
         * @public
         */
        disable: function(selector){
            this._enableOrDisableDRY(selector, false);
        },

        /**
         * Enables the desired tag
         * 
         * @method enable
         * @param {String|DOMElement} selector      The id of the desired tab or the link that links to it
         * @public
         */
        enable: function(selector){
            this._enableOrDisableDRY(selector, true);
        },

        /***********
         * Getters *
         ***********/

        /**
         * Returns the active tab id
         * 
         * @method activeTab
         * @return {String} ID of the active tab.
         * @public
         */
        activeTab: function(){
            return this._activeContentTab.getAttribute('id');
        },

        /**
         *
         * Returns the parent of the currently active menu link.
         *
         * This is useful if you want to have `li` elements wrapping your links
         * and want to access the currently visible one.
         *
         * (This method is deprecated)
         * @method activeMenuTab
         * @deprecated
         * @return {DOMElement|null} Active menu LI, or `null` if there is none.
         * @public
         */
        activeMenuTab: function(){
            // [3.1.0] remove this
            Ink.warn('Ink.UI.Tabs.activeMenuTab() is deprecated');
            return this._activeMenuTab;
        },

        /**
         * Gets the currently active Menu link (the links which the user clicks on to change tabs)
         * 
         * @method activeMenuLink
         * @return {DOMElement|null} Active menu link, or `null` if there is none.
         * @public
         */
        activeMenuLink: function(){
            return this._activeMenuLink;
        },

        /**
         * Gets the currently active section
         *
         * (Each section contains content for a tab, and must have an `id` attribute)
         * 
         * @method activeContentTab
         * @return {DOMElement|null} Active section, or `null` if there is none.
         * @public
         */
        activeContentTab: function(){
            return this._activeContentTab;
        },

        /**
         * Unregisters the component and removes its markup
         * 
         * @method destroy
         * @public
         */
        destroy: Common.destroyComponent
    };

    return Tabs;

});

/*
 * Tagging input element
 * @module Ink.UI.TagField_1
 * @version 1
 */
Ink.createModule("Ink.UI.TagField","1",["Ink.Dom.Element_1", "Ink.Dom.Event_1", "Ink.Dom.Css_1", "Ink.Dom.Browser_1", "Ink.UI.Droppable_1", "Ink.Util.Array_1", "Ink.Dom.Selector_1", "Ink.UI.Common_1"],function( InkElement, InkEvent, Css, Browser, Droppable, InkArray, Selector, Common) {
    'use strict';

    var enterKey = 13;
    var backspaceKey = 8;
    var isTruthy = function (val) {return !!val;};

    /**
     * Use this class to have a field where a user can input several tags into a single text field. A good example is allowing the user to describe a blog post or a picture through tags, for later searching.
     *
     * The markup is as follows:
     *
     *           <input class="ink-tagfield" type="text" value="initial,value">
     *
     * By applying this UI class to the above input, you get a tag field with the tags "initial" and "value". The class preserves the original input element. It remains hidden and is updated with new tag information dynamically, so regular HTML form logic still applies.
     *
     * Below "input" refers to the current value of the input tag (updated as the user enters text, of course), and "output" refers to the value which this class writes back to said input tag.
     *
     * @class Ink.UI.TagField
     * @version 1
     * @constructor
     * @param {String|DOMElement}   element                         Selector or DOM Input Element.
     * @param {Object}              [options]                       Options object
     * @param {String|Array}        [options.tags]                  Initial tags in the input
     * @param {Boolean}             [options.allowRepeated]         Flag to allow user to input several tags. Defaults to true.
     * @param {RegExp}              [options.separator]             Split the input by this RegExp. Defaults to /[,;(space)]+/g (spaces, commas and semicolons)
     * @param {String}              [options.outSeparator]          Use this string to separate each tag from the next in the output. Defaults to ','.
     * @param {Boolean}             [options.autoSplit]             Flag to activate tag creation when the user types a separator. Defaults to true.
     * @param {Integer}             [options.maxTags]               Maximum number of tags allowed. Set to -1 for no limit. Defaults to -1.
     * @example
     */
    function TagField(element, options) {
        this.init(element, options);
    }

    TagField.prototype = {
        /**
         * Init function called by the constructor
         * 
         * @method _init
         * @private
         */
        init: function(element, options) {
            element = this._element = Common.elOrSelector(element, 'Ink.UI.TagField');
            var o = this._options = Common.options('Ink.UI.TagField', {
                tags: ['String', []],
                tagQuery: ['Object', null],
                tagQueryAsync: ['Object', null],
                allowRepeated: ['Boolean', false],
                maxTags: ['Integer', -1],
                outSeparator: ['String', ','],
                separator: ['String', /[,; ]+/g],
                autoSplit: ['Boolean', true]
            }, options || {}, this._element);

            if (typeof o.separator === 'string') {
                o.separator = new RegExp(o.separator, 'g');
            }

            if (typeof o.tags === 'string') {
                // coerce to array using the separator
                o.tags = this._readInput(o.tags);
            }

            Css.addClassName(this._element, 'hide-all');

            this._viewElm = InkElement.create('div', {
                className: 'ink-tagfield',
                insertAfter: this._element
            });

            this._input = InkElement.create('input', {
                type: 'text',
                className: 'new-tag-input',
                insertBottom: this._viewElm
            });

            var tags = [].concat(o.tags, this._tagsFromMarkup(this._element));

            this._tags = [];

            InkArray.each(tags, Ink.bindMethod(this, '_addTag'));

            InkEvent.observe(this._input, 'keyup', Ink.bindEvent(this._onKeyUp, this));
            InkEvent.observe(this._input, 'change', Ink.bindEvent(this._onKeyUp, this));
            InkEvent.observe(this._input, 'keydown', Ink.bindEvent(this._onKeyDown, this));
            InkEvent.observe(this._input, 'blur', Ink.bindEvent(this._onBlur, this));
            InkEvent.observe(this._viewElm, 'click', Ink.bindEvent(this._refocus, this));

            Common.registerInstance(this, this._element);
        },

        destroy: function () {
            InkElement.remove(this._viewElm);
            Css.removeClassName(this._element, 'hide-all');
        },

        _tagsFromMarkup: function (element) {
            var tagname = element.tagName.toLowerCase();
            if (tagname === 'input') {
                return this._readInput(element.value);
            } else if (tagname === 'select') {
                return InkArray.map(element.getElementsByTagName('option'), function (option) {
                    return InkElement.textContent(option);
                });
            } else {
                throw new Error('Cannot read tags from a ' + tagname + ' tag. Unknown tag');
            }
        },

        _tagsToMarkup: function (tags, element) {
            var tagname = element.tagName.toLowerCase();
            if (tagname === 'input') {
                if (this._options.separator) {
                    element.value = tags.join(this._options.outSeparator);
                }
            } else if (tagname === 'select') {
                element.innerHTML = '';
                InkArray.each(tags, function (tag) {
                    var opt = InkElement.create('option', {selected: 'selected'});
                    InkElement.setTextContent(opt, tag);
                    element.appendChild(opt);
                });
            } else {
                throw new Error('TagField: Cannot read tags from a ' + tagname + ' tag. Unknown tag');
            }
        },

        _addTag: function (tag) {
            if (this._options.maxTags !== -1 &&
                    this._tags.length >= this._options.maxTags) {
                return;
            }
            if ((!this._options.allowRepeated &&
                    InkArray.inArray(tag, this._tags, tag)) || !tag) {
                return false;
            }
            var elm = InkElement.create('span', {
                className: 'ink-tag',
                setTextContent: tag + ' '
            });

            var remove = InkElement.create('span', {
                className: 'remove fa fa-times',
                insertBottom: elm
            });
            InkEvent.observe(remove, 'click', Ink.bindEvent(this._removeTag, this, null));

            var spc = document.createTextNode(' ');

            this._tags.push(tag);
            this._viewElm.insertBefore(elm, this._input);
            this._viewElm.insertBefore(spc, this._input);
            this._tagsToMarkup(this._tags, this._element);
        },

        _readInput: function (text) {
            if (this._options.separator) {
                return InkArray.filter(text.split(this._options.separator), isTruthy);
            } else {
                return [text];
            }
        },

        _onKeyUp: function () {  // TODO control input box size
            if (!this._options.autoSplit) {
                return;
            }
            var split = this._input.value.split(this._options.separator);
            if (split.length <= 1) {
                return;
            }
            var last = split[split.length - 1];
            split = split.splice(0, split.length - 1);
            split = InkArray.filter(split, isTruthy);
            
            InkArray.each(split, Ink.bind(this._addTag, this));
            this._input.value = last;
        },

        _onKeyDown: function (event) {
            if (event.which === enterKey) {
                return this._onEnterKeyDown(event);
            } else if (event.which === backspaceKey) {
                return this._onBackspaceKeyDown();
            } else if (this._removeConfirm) {
                // user pressed another key, cancel removal from a backspace key
                this._unsetRemovingVisual(this._tags.length - 1);
            }
        },

        /**
         * When the user presses backspace twice on the empty input, we delete the last tag on the field.
         * @method onBackspaceKeyDown
         * @private
         */
        _onBackspaceKeyDown: function () {
            if (this._input.value) { return; }

            if (this._removeConfirm) {
                this._unsetRemovingVisual(this._tags.length - 1);
                this._removeTag(this._tags.length - 1);
                this._removeConfirm = null;
            } else {
                this._setRemovingVisual(this._tags.length - 1);
            }
        },

        _onEnterKeyDown: function (event) {
            var tag = this._input.value;
            if (tag) {
                this._addTag(tag);
                this._input.value = '';
            }
            InkEvent.stopDefault(event);
        },

        _onBlur: function () {
            this._addTag(this._input.value);
            this._input.value = '';
        },

        /* For when the user presses backspace.
         * Set the style of the tag so that it seems like it's going to be removed
         * if they press backspace again. */
        _setRemovingVisual: function (tagIndex) {
            var elm = this._viewElm.children[tagIndex];
            Css.addClassName(elm, 'tag-deleting');

            this._removeRemovingVisualTimeout = setTimeout(Ink.bindMethod(this, '_unsetRemovingVisual', tagIndex), 4000);
            InkEvent.observe(this._input, 'blur', Ink.bindMethod(this, '_unsetRemovingVisual', tagIndex));
            this._removeConfirm = true;
        },
        _unsetRemovingVisual: function (tagIndex) {
            var elm = this._viewElm.children[tagIndex];
            if (elm) {
                Css.removeClassName(elm, 'tag-deleting');
                clearTimeout(this._removeRemovingVisualTimeout);
            }
            this._removeConfirm = null;
        },

        _removeTag: function (event) {
            var index;
            if (typeof event === 'object') {  // click event on close button
                var elm = InkEvent.element(event).parentNode;
                index = InkElement.parentIndexOf(this._viewElm, elm);
            } else if (typeof event === 'number') {  // manual removal
                index = event;
            }
            this._tags = InkArray.remove(this._tags, index, 1);
            InkElement.remove(this._viewElm.children[index]);
            this._tagsToMarkup(this._tags, this._element);
        },

        _refocus: function (event) {
            this._input.focus();
            InkEvent.stop(event);
            return false;
        }
    };
    return TagField;
});

/**
 * Toggle the visibility of elements.
 * @module Ink.UI.Toggle_1
 * @version 1
 */

 Ink.createModule('Ink.UI.Toggle', '1', ['Ink.UI.Common_1','Ink.Dom.Event_1','Ink.Dom.Css_1','Ink.Dom.Element_1','Ink.Dom.Selector_1','Ink.Util.Array_1'], function(Common, InkEvent, Css, InkElement, Selector, InkArray ) {
    'use strict';

    /**
     *
     * You need two elements to use Toggle: the `trigger` element, and the `target` element (or elements). The default behaviour is to toggle the `target`(s) when you click the `trigger`.
     *
     * The toggle has a state. It is either "on" or "off". It works by switching between the CSS classes in `classNameOn` and `classNameOff` according to the current state.
     *
     * When you initialize the Toggle, it will check if the targets are visible to figure out what the initial state is. You can force the toggle to consider itself turned "on" or "off" by setting the `initialState` option to `true` or `false`, respectively.
     *
     * You can get the current state of the Toggle by calling `getState`, or by checking if your `trigger` element has the "active" class.
     * The state can be changed through JavaScript. Just call  `setState(true)` 
     * to turn the Toggle on (or `setState(false)` to turn it off).
     *
     * @class Ink.UI.Toggle
     * @constructor
     * @version 1
     * @param {String|DOMElement} selector  Trigger element. By clicking this, the target (or targets) are triggered.
     * @param {Object} [options] Options object, containing:
     *
     * @param {String}              options.target                  CSS Selector that specifies the elements that this component will toggle
     * @param {String}              [options.classNameOn]           CSS class to toggle when on. Defaults to 'show-all'.
     * @param {String}              [options.classNameOff]          CSS class to toggle when off. Defaults to 'hide-all'.
     * @param {String}              [options.triggerEvent]          Event that will trigger the toggling. Defaults to 'click'.
     * @param {Boolean}             [options.closeOnClick]          Flag to toggle the targe off when clicking outside the toggled content. Defaults to true.
     * @param {String}              [options.closeOnInsideClick]    Toggle off when an element matching this selector is clicked. Set to null to deactivate the check. Defaults to 'a[href]'.
     * @param {Boolean}             [options.initialState]          Flag to define initial state. false: off, true: on, null: markup. Defaults to null.
     * @param {Function}            [options.onChangeState]         Callback when the toggle state changes. Return `false` to cancel the event.
     *
     * @sample Ink_UI_Toggle_1_constructor.html
     */
    var Toggle = function( selector, options ){
        this._rootElement = Common.elOrSelector(selector, '[Ink.UI.Toggle root element]:');

        this._options = Ink.extendObj({
            target : undefined,
            triggerEvent: 'click',
            closeOnClick: true,
            isAccordion: false,
            initialState: null,
            classNameOn: 'show-all',
            classNameOff: 'hide-all',
            togglesDisplay: null,
            closeOnInsideClick: 'a[href]',  // closes the toggle when a target is clicked and it is a link
            onChangeState: null
        }, options || {}, InkElement.data(this._rootElement));

        this._targets = Common.elsOrSelector(this._options.target, 'Ink.UI.Toggle target option', true);

        // Boolean option handling
        this._options.closeOnClick = this._options.closeOnClick.toString() === 'true';
        // Actually a throolean
        if (this._options.initialState !== null){
            this._options.initialState = this._options.initialState.toString() === 'true';
        } else {
            this._options.initialState = Css.getStyle(this._targets[0], 'display') !== 'none';
        }

        if (this._options.classNameOn !== 'show-all' || this._options.classNameOff !== 'hide-all') {
            for (var i = 0, len = this._targets.length; i < len; i++) {
                Css.removeClassName(this._targets[i], 'show-all');
                Css.removeClassName(this._targets[i], 'hide-all');
            }
        }

        this._init();

        Common.registerInstance(this, this._rootElement);
    };

    Toggle.prototype = {

        /**
         * Init function called by the constructor
         * 
         * @method _init
         * @private
         */
        _init: function(){
            this._accordion = ( Css.hasClassName(this._rootElement.parentNode,'accordion') || Css.hasClassName(this._targets[0].parentNode,'accordion') );

            this._firstTime = true;

            this._bindEvents();

            if (this._options.initialState !== null) {
                this.setState(this._options.initialState, true);
            } else {
                // Add initial classes matching the current "display" of the object.
                var state = Css.getStyle(this._targets[0], 'display') !== 'none';
                this.setState(state, true);
            }
            // Aditionally, remove any inline "display" style.
            for (var i = 0, len = this._targets.length; i < len; i++) {
                if (this._targets[i].style.display) {
                    this._targets[i].style.display = '';  // becomes default
                }
            }

            this._rootElement.setAttribute('data-is-toggle-trigger', 'true');
        },

        /**
         * @method _bindEvents
         * @private
         */
        _bindEvents: function () {
            if ( this._options.triggerEvent ) {
                InkEvent.observe(
                    this._rootElement,
                    this._options.triggerEvent,
                    Ink.bind(this._onTriggerEvent, this));
            }
            if( this._options.closeOnClick ){
                InkEvent.observe( document, 'click', Ink.bind(this._onOutsideClick, this));
            }
            if( this._options.closeOnInsideClick && this._options.closeOnInsideClick !== 'false') {
                var sel = this._options.closeOnInsideClick;
                if (sel.toString() === 'true') {
                    sel = '*';
                }
                InkEvent.observeMulti(this._targets, 'click', Ink.bind(function (e) {
                    if ( InkElement.findUpwardsBySelector(InkEvent.element(e), sel) ) {
                        this.setState(false, true);
                    }
                }, this));
            }
        },

        /**
         * Event handler. It's responsible for handling the `triggerEvent` as defined in the options.
         *
         * This will trigger the toggle.
         * 
         * @method _onTriggerEvent
         * @param {Event} event
         * @private
         */
        _onTriggerEvent: function( event ){
            // When the togglee is a child of the toggler, we get the togglee's events here. We have to check that this event is for us.
            var target = InkEvent.element(event);

            var isAncestorOfClickedElement = InkArray.some(this._targets, function (thisOne) {
                return thisOne === target || InkElement.isAncestorOf(thisOne, target);
            });

            if (isAncestorOfClickedElement) {
                return;
            }

            if (this._accordion) {
                this._updateAccordion();
            }

            var has = this.getState();
            this.setState(!has, true);
            if (!has && this._firstTime) {
                this._firstTime = false;
            }

            InkEvent.stopDefault(event);
        },

        /**
         * Be compatible with accordions
         *
         * @method _updateAccordion
         **/
        _updateAccordion: function () {
            var elms, accordionElement;
            if( Css.hasClassName(this._targets[0].parentNode,'accordion') ){
                accordionElement = this._targets[0].parentNode;
            } else {
                accordionElement = this._targets[0].parentNode.parentNode;
            }
            elms = Selector.select('.toggle, .ink-toggle',accordionElement);
            for(var i=0; i<elms.length; i+=1 ){
                var dataset = InkElement.data( elms[i] ),
                    targetElm = Selector.select( dataset.target,accordionElement );

                if( (targetElm.length > 0) && (targetElm[0] !== this._targets[0]) ){
                    targetElm[0].style.display = 'none';
                }
            }
        },

        /**
         * Click handler. Will handle clicks outside the toggle component.
         * 
         * @method _onOutsideClick
         * @param {Event} event
         * @private
         */
        _onOutsideClick: function( event ){
            var tgtEl = InkEvent.element(event),
                shades;

            if (InkElement.findUpwardsBySelector(tgtEl, '[data-is-toggle-trigger="true"]')) return;

            var ancestorOfTargets = InkArray.some(this._targets, function (target) {
                return InkElement.isAncestorOf(target, tgtEl) || target === tgtEl;
            });

            if( (this._rootElement === tgtEl) || InkElement.isAncestorOf(this._rootElement, tgtEl) || ancestorOfTargets) {
                return;
            } else if( (shades = Ink.ss('.ink-shade')).length ) {
                var shadesLength = shades.length;

                for( var i = 0; i < shadesLength; i++ ){
                    if( InkElement.isAncestorOf(shades[i],tgtEl) && InkElement.isAncestorOf(shades[i],this._rootElement) ){
                        return;
                    }
                }
            }

            this.setState(false, true);  // dismiss
        },

        /**
         * Sets the state of the toggle. (on/off)
         *
         * @method setState
         * @param newState {Boolean} New state (on/off)
         */
        setState: function (on, callHandler) {
            if (on === this.getState()) { return; }
            if (callHandler && typeof this._options.onChangeState === 'function') {
                var ret = this._options.onChangeState(on);
                if (ret === false) { return false; } //  Canceled by the event handler
            }
            for (var i = 0, len = this._targets.length; i < len; i++) {
                Css.addRemoveClassName(this._targets[i], this._options.classNameOn, on);
                Css.addRemoveClassName(this._targets[i], this._options.classNameOff, !on);
            }
            Css.addRemoveClassName(this._rootElement, 'active', on);
        },

        /**
         * Gets the state of the toggle. (on/off)
         *
         * @method getState
         *
         * @return {Boolean} whether the toggle is toggled on.
         */
        getState: function () {
            return Css.hasClassName(this._rootElement, 'active');
        }
    };

    return Toggle;
});

/**
 * Content Tooltips
 * @module Ink.UI.Tooltip_1
 * @version 1
 */
Ink.createModule('Ink.UI.Tooltip', '1', ['Ink.UI.Common_1', 'Ink.Dom.Event_1', 'Ink.Dom.Element_1', 'Ink.Dom.Selector_1', 'Ink.Util.Array_1', 'Ink.Dom.Css_1', 'Ink.Dom.Browser_1'], function (Common, InkEvent, InkElement, Selector, InkArray, Css) {
    'use strict';

    /**
     * Tooltips are useful as a means to display information about functionality while avoiding clutter.
     *
     * Tooltips show up when you hover elements which "have" tooltips.
     *
     * This class will "give" a tooltip to many elements, selected by its first argument (`target`). This is contrary to the other UI modules in Ink, which are created once per element.
     *
     * You can define options either through the second argument of the Tooltip constructor, or as data-attributes in each `target` element. Options set through data-attributes all start with "data-tip", and override options passed into the Tooltip constructor.
     *
     * @class Ink.UI.Tooltip
     * @constructor
     *
     * @param {DOMElement|String}   target                  Target element or selector of elements, to display the tooltips on.
     * @param {Object}              [options]               Options object
     * @param {String}              [options.text]          Text content for the tooltip.
     * @param {String}              [options.html]          HTML for the tooltip. Same as above, but won't escape HTML.
     * @param {String}              [options.where]         Positioning for the tooltip. Options are 'up', 'down', 'left', 'right', 'mousemove' (follows the cursor), and 'mousefix' (stays fixed). Defaults to 'up'.
     *     
     * @param {String}              [options.color]         Color of the tooltip. Options are red, orange, blue, green and black. Default is white.
     * @param {Number}              [options.fade]          Number of seconds to fade in/out. Defaults to 0.3.
     * @param {Boolean}             [options.forever]       Flag to prevent the tooltip from being erased when the mouse hovers away from the target.
     * @param {Number}              [options.timeout]       Number of seconds the tooltip will stay open. Useful together with options.forever. Defaults to 0.
     * @param {Number}              [options.delay]         Time the tooltip waits until it is displayed. Useful to avoid getting the attention of the user unnecessarily
     * @param {DOMElement|Selector} [options.template]      Element or selector containing HTML to be cloned into the tooltips. Can be a hidden element, because CSS `display` is set to `block`.
     * @param {String}              [options.templatefield] Selector within the template element to choose where the text is inserted into the tooltip. Useful when a wrapper DIV is required.
     * @param {Number}              [options.left]          Spacing from the target to the tooltip, when `where` is `mousemove` or `mousefix`. Defaults to 10.
     * @param {Number}              [options.top]           Spacing from the target to the tooltip, when `where` is `mousemove` or `mousefix`. Defaults to 10.
     * @param {Number}              [options.spacing]       Spacing between the tooltip and the target element, when `where` is not `mousemove` or `mousefix`. Defaults to 8.
     * 
     * @sample Ink_UI_Tooltip_1.html
     */
    function Tooltip(element, options) {
        this._init(element, options || {});
    }

    function EachTooltip(root, elm) {
        this._init(root, elm);
    }

    var transitionDurationName,
        transitionPropertyName,
        transitionTimingFunctionName;
    (function () {  // Feature detection
        var test = document.createElement('DIV');
        var names = ['transition', 'oTransition', 'msTransition', 'mozTransition',
            'webkitTransition'];
        for (var i = 0; i < names.length; i++) {
            if (typeof test.style[names[i] + 'Duration'] !== 'undefined') {
                transitionDurationName = names[i] + 'Duration';
                transitionPropertyName = names[i] + 'Property';
                transitionTimingFunctionName = names[i] + 'TimingFunction';
                break;
            }
        }
    }());

    // Body or documentElement
    var bodies = document.getElementsByTagName('body');
    var body = bodies.length ? bodies[0] : document.documentElement;

    Tooltip.prototype = {
        _init: function(element, options) {
            var elements;

            this.options = Ink.extendObj({
                    where: 'up',
                    zIndex: 10000,
                    left: 10,
                    top: 10,
                    spacing: 8,
                    forever: 0,
                    color: '',
                    timeout: 0,
                    delay: 0,
                    template: null,
                    templatefield: null,
                    fade: 0.3,
                    text: ''
                }, options || {});

            if (typeof element === 'string') {
                elements = Selector.select(element);
            } else if (typeof element === 'object') {
                elements = [element];
            } else {
                throw 'Element expected';
            }

            this.tooltips = [];

            for (var i = 0, len = elements.length; i < len; i++) {
                this.tooltips[i] = new EachTooltip(this, elements[i]);
            }
        },
        /**
         * Destroys the tooltips created by this instance
         *
         * @method destroy
         */
        destroy: function () {
            InkArray.each(this.tooltips, function (tooltip) {
                tooltip._destroy();
            });
            this.tooltips = null;
            this.options = null;
        }
    };

    EachTooltip.prototype = {
        _oppositeDirections: {
            left: 'right',
            right: 'left',
            up: 'down',
            down: 'up'
        },
        _init: function(root, elm) {
            InkEvent.observe(elm, 'mouseover', Ink.bindEvent(this._onMouseOver, this));
            InkEvent.observe(elm, 'mouseout', Ink.bindEvent(this._onMouseOut, this));
            InkEvent.observe(elm, 'mousemove', Ink.bindEvent(this._onMouseMove, this));

            this.root = root;
            this.element = elm;
            this._delayTimeout = null;
            this.tooltip = null;

            Common.registerInstance(this, this.element);
        },
        _makeTooltip: function (mousePosition) {
            if (!this._getOpt('text') &&
                    !this._getOpt('html') &&
                    !InkElement.hasAttribute(this.element, 'title')) {
                return false;
            }

            var tooltip = this._createTooltipElement();

            if (this.tooltip) {
                this._removeTooltip();
            }

            this.tooltip = tooltip;

            this._fadeInTooltipElement(tooltip);
            this._placeTooltipElement(tooltip, mousePosition);

            InkEvent.observe(tooltip, 'mouseover', Ink.bindEvent(this._onTooltipMouseOver, this));

            var timeout = this._getFloatOpt('timeout');
            if (timeout) {
                setTimeout(Ink.bind(function () {
                    if (this.tooltip === tooltip) {
                        this._removeTooltip();
                    }
                }, this), timeout * 1000);
            }
        },
        _createTooltipElement: function () {
            var template = this._getOpt('template'),  // User template instead of our HTML
                templatefield = this._getOpt('templatefield'),
                
                tooltip,  // The element we float
                field;  // Element where we write our message. Child or same as the above

            if (template) {  // The user told us of a template to use. We copy it.
                var temp = document.createElement('DIV');
                temp.innerHTML = Common.elOrSelector(template, 'options.template').outerHTML;
                tooltip = temp.firstChild;
                
                if (templatefield) {
                    field = Selector.select(templatefield, tooltip);
                    if (field) {
                        field = field[0];
                    } else {
                        throw 'options.templatefield must be a valid selector within options.template';
                    }
                } else {
                    field = tooltip;  // Assume same element if user did not specify a field
                }
            } else {  // We create the default structure
                tooltip = document.createElement('DIV');
                Css.addClassName(tooltip, 'ink-tooltip');
                Css.addClassName(tooltip, this._getOpt('color'));

                field = document.createElement('DIV');
                Css.addClassName(field, 'content');

                tooltip.appendChild(field);
            }
            
            if (this._getOpt('html')) {
                field.innerHTML = this._getOpt('html');
            } else if (this._getOpt('text')) {
                InkElement.setTextContent(field, this._getOpt('text'));
            } else {
                InkElement.setTextContent(field, this.element.getAttribute('title'));
            }
            tooltip.style.display = 'block';
            tooltip.style.position = 'absolute';
            tooltip.style.zIndex = this._getIntOpt('zIndex');

            return tooltip;
        },
        _fadeInTooltipElement: function (tooltip) {
            var fadeTime = this._getFloatOpt('fade');
            if (transitionDurationName && fadeTime) {
                tooltip.style.opacity = '0';
                tooltip.style[transitionDurationName] = fadeTime + 's';
                tooltip.style[transitionPropertyName] = 'opacity';
                tooltip.style[transitionTimingFunctionName] = 'ease-in-out';
                setTimeout(function () {
                    tooltip.style.opacity = '1';
                }, 0); // Wait a tick
            }
        },
        _placeTooltipElement: function (tooltip, mousePosition) {
            var where = this._getOpt('where');

            if (where === 'mousemove' || where === 'mousefix') {
                var mPos = mousePosition;
                this._setPos(mPos[0], mPos[1]);
                body.appendChild(tooltip);
            } else if (where.match(/(up|down|left|right)/)) {
                body.appendChild(tooltip);
                var targetElementPos = InkElement.offset(this.element);
                var tleft = targetElementPos[0],
                    ttop = targetElementPos[1];

                var centerh = (InkElement.elementWidth(this.element) / 2) - (InkElement.elementWidth(tooltip) / 2),
                    centerv = (InkElement.elementHeight(this.element) / 2) - (InkElement.elementHeight(tooltip) / 2);
                var spacing = this._getIntOpt('spacing');

                var tooltipDims = InkElement.elementDimensions(tooltip);
                var elementDims = InkElement.elementDimensions(this.element);

                var maxX = InkElement.scrollWidth() + InkElement.viewportWidth();
                var maxY = InkElement.scrollHeight() + InkElement.viewportHeight();
                
                where = this._getWhereValueInsideViewport(where, {
                    left: tleft - tooltipDims[0],
                    right: tleft + tooltipDims[0],
                    top: ttop + tooltipDims[1],
                    bottom: ttop + tooltipDims[1]
                }, {
                    right: maxX,
                    bottom: maxY
                });
                
                if (where === 'up') {
                    ttop -= tooltipDims[1];
                    ttop -= spacing;
                    tleft += centerh;
                } else if (where === 'down') {
                    ttop += elementDims[1];
                    ttop += spacing;
                    tleft += centerh;
                } else if (where === 'left') {
                    tleft -= tooltipDims[0];
                    tleft -= spacing;
                    ttop += centerv;
                } else if (where === 'right') {
                    tleft += elementDims[0];
                    tleft += spacing;
                    ttop += centerv;
                }
                
                var arrow = null;
                if (where.match(/(up|down|left|right)/)) {
                    arrow = document.createElement('SPAN');
                    Css.addClassName(arrow, 'arrow');
                    Css.addClassName(arrow, this._oppositeDirections[where]);
                    tooltip.appendChild(arrow);
                }

                var tooltipLeft = tleft;
                var tooltipTop = ttop;

                var toBottom = (tooltipTop + tooltipDims[1]) - maxY;
                var toRight = (tooltipLeft + tooltipDims[0]) - maxX;
                var toLeft = 0 - tooltipLeft;
                var toTop = 0 - tooltipTop;

                if (toBottom > 0) {
                    if (arrow) { arrow.style.top = (tooltipDims[1] / 2) + toBottom + 'px'; }
                    tooltipTop -= toBottom;
                } else if (toTop > 0) {
                    if (arrow) { arrow.style.top = (tooltipDims[1] / 2) - toTop + 'px'; }
                    tooltipTop += toTop;
                } else if (toRight > 0) {
                    if (arrow) { arrow.style.left = (tooltipDims[0] / 2) + toRight + 'px'; }
                    tooltipLeft -= toRight;
                } else if (toLeft > 0) {
                    if (arrow) { arrow.style.left = (tooltipDims[0] / 2) - toLeft + 'px'; }
                    tooltipLeft += toLeft;
                }

                tooltip.style.left = tooltipLeft + 'px';
                tooltip.style.top = tooltipTop + 'px';
            }
        },

        /**
         * Get a value for "where" (left/right/up/down) which doesn't put the
         * tooltip off the screen
         *
         * @method _getWhereValueInsideViewport
         * @param where {String} "where" value which was given by the user and we might change
         * @param bbox {BoundingBox} A bounding box like what you get from getBoundingClientRect ({top, bottom, left, right}) with pixel positions from the top left corner of the viewport.
         * @param viewport {BoundingBox} Bounding box for the viewport. "top" and "left" are omitted because these coordinates are relative to the top-left corner of the viewport so they are zero.
         *
         * @TODO: we can't use getBoundingClientRect in this case because it returns {0,0,0,0} on our uncreated tooltip.
         */
        _getWhereValueInsideViewport: function (where, bbox, viewport) {
            if (where === 'left' && bbox.left < 0) {
                return 'right';
            } else if (where === 'right' && bbox.right > viewport.right) {
                return 'left';
            } else if (where === 'up' && bbox.top < 0) {
                return 'down';
            } else if (where === 'down' && bbox.bottom > viewport.bottom) {
                return 'up';
            }

            return where;
        },
        _removeTooltip: function() {
            var tooltip = this.tooltip;
            if (!tooltip) {return;}

            var remove = Ink.bind(InkElement.remove, {}, tooltip);

            if (this._getOpt('where') !== 'mousemove' && transitionDurationName) {
                tooltip.style.opacity = 0;
                // remove() will operate on correct tooltip, although this.tooltip === null then
                setTimeout(remove, this._getFloatOpt('fade') * 1000);
            } else {
                remove();
            }
            this.tooltip = null;
        },
        _getOpt: function (option) {
            var dataAttrVal = InkElement.data(this.element)[InkElement._camelCase('tip-' + option)];
            if (dataAttrVal /* either null or "" may signify the absense of this attribute*/) {
                return dataAttrVal;
            }
            var instanceOption = this.root.options[option];
            if (typeof instanceOption !== 'undefined') {
                return instanceOption;
            }
        },
        _getIntOpt: function (option) {
            return parseInt(this._getOpt(option), 10);
        },
        _getFloatOpt: function (option) {
            return parseFloat(this._getOpt(option), 10);
        },
        _destroy: function () {
            if (this.tooltip) {
                InkElement.remove(this.tooltip);
            }
            this.root = null;  // Cyclic reference = memory leaks
            this.element = null;
            this.tooltip = null;
        },
        _onMouseOver: function(e) {
            // on IE < 10 you can't access the mouse event not even a tick after it fired
            var mousePosition = this._getMousePosition(e);
            var delay = this._getFloatOpt('delay');
            if (delay) {
                this._delayTimeout = setTimeout(Ink.bind(function () {
                    if (!this.tooltip) {
                        this._makeTooltip(mousePosition);
                    }
                    this._delayTimeout = null;
                }, this), delay * 1000);
            } else {
                this._makeTooltip(mousePosition);
            }
        },
        _onMouseMove: function(e) {
            if (this._getOpt('where') === 'mousemove' && this.tooltip) {
                var mPos = this._getMousePosition(e);
                this._setPos(mPos[0], mPos[1]);
            }
        },
        _onMouseOut: function () {
            if (!this._getIntOpt('forever')) {
                this._removeTooltip();
            }
            if (this._delayTimeout) {
                clearTimeout(this._delayTimeout);
                this._delayTimeout = null;
            }
        },
        _onTooltipMouseOver: function () {
            if (this.tooltip) {  // If tooltip is already being removed, this has no effect
                this._removeTooltip();
            }
        },
        _setPos: function(left, top) {
            left += this._getIntOpt('left');
            top += this._getIntOpt('top');
            var pageDims = this._getPageXY();
            if (this.tooltip) {
                var elmDims = [InkElement.elementWidth(this.tooltip), InkElement.elementHeight(this.tooltip)];
                var scrollDim = this._getScroll();

                if((elmDims[0] + left - scrollDim[0]) >= (pageDims[0] - 20)) {
                    left = (left - elmDims[0] - this._getIntOpt('left') - 10);
                }
                if((elmDims[1] + top - scrollDim[1]) >= (pageDims[1] - 20)) {
                    top = (top - elmDims[1] - this._getIntOpt('top') - 10);
                }

                this.tooltip.style.left = left + 'px';
                this.tooltip.style.top = top + 'px';
            }
        },
        _getPageXY: function() {
            var cWidth = 0;
            var cHeight = 0;
            if( typeof( window.innerWidth ) === 'number' ) {
                cWidth = window.innerWidth;
                cHeight = window.innerHeight;
            } else if( document.documentElement && ( document.documentElement.clientWidth || document.documentElement.clientHeight ) ) {
                cWidth = document.documentElement.clientWidth;
                cHeight = document.documentElement.clientHeight;
            } else if( document.body && ( document.body.clientWidth || document.body.clientHeight ) ) {
                cWidth = document.body.clientWidth;
                cHeight = document.body.clientHeight;
            }
            return [parseInt(cWidth, 10), parseInt(cHeight, 10)];
        },
        _getScroll: function() {
            var dd = document.documentElement, db = document.body;
            if (dd && (dd.scrollLeft || dd.scrollTop)) {
                return [dd.scrollLeft, dd.scrollTop];
            } else if (db) {
                return [db.scrollLeft, db.scrollTop];
            } else {
                return [0, 0];
            }
        },
        _getMousePosition: function(e) {
            return [parseInt(InkEvent.pointerX(e), 10), parseInt(InkEvent.pointerY(e), 10)];
        }
    };

    return Tooltip;
});

/**
 * Elements in a tree structure
 * @module Ink.UI.TreeView_1
 * @version 1
 */
Ink.createModule('Ink.UI.TreeView', '1', ['Ink.UI.Common_1','Ink.Dom.Event_1','Ink.Dom.Css_1','Ink.Dom.Element_1','Ink.Dom.Selector_1','Ink.Util.Array_1'], function(Common, Event, Css, Element, Selector, InkArray ) {
    'use strict';


    /**
     * Shows elements in a tree structure which can be expanded and contracted.
     * A TreeView is built with "node"s and "children". "node"s are `li` tags, and "children" are `ul` tags.
     * You can build your TreeView out of a regular UL and  LI element structure which you already use to display lists with several levels.
     * If you want a node to be open when the TreeView is built, just add the data-open="true" attribute to it.
     * 
     * @class Ink.UI.TreeView
     * @constructor
     * @version 1
     * @param {String|DOMElement}   selector                    Element or selector.
     * @param {String}              [options]                   Options object, containing:
     * @param {String}              [options.node]              Selector for the nodes. Defaults to 'li'.
     * @param {String}              [options.children]          Selector for the children. Defaults to 'ul'.
     * @param {String}              [options.parentClass]       CSS classes to be added to parent nodes. Defaults to 'parent'.
     * @param {String}              [options.openClass]         CSS classes to be added to the icon when a parent is open. Defaults to 'fa fa-minus-circle'.
     * @param {String}              [options.closedClass]       CSS classes to be added to the icon when a parent is closed. Defaults to 'fa fa-plus-circle'.
     * @param {String}              [options.hideClass]         CSS Class to toggle visibility of the children. Defaults to 'hide-all'.
     * @param {String}              [options.iconTag]           The name of icon tag. The component tries to find a tag with that name as a direct child of the node. If it doesn't find it, it creates it. Defaults to 'i'.
     * @param {Boolean}             [options.stopDefault]       Flag to stops the default behavior of the click handler. Defaults to true.
     * @example
     *      <ul class="ink-tree-view">
     *        <li data-open="true"><a href="#">root</a>
     *          <ul>
     *            <li><a href="#">child 1</a></li>
     *            <li><a href="#">child 2</a>
     *              <ul>
     *                <li><a href="#">grandchild 2a</a></li>
     *                <li><a href="#">grandchild 2b</a>
     *                  <ul>
     *                    <li><a href="#">grandgrandchild 1bA</a></li>
     *                    <li><a href="#">grandgrandchild 1bB</a></li>
     *                  </ul>
     *                </li>
     *              </ul>
     *            </li>
     *            <li><a href="#">child 3</a></li>
     *          </ul>
     *        </li>
     *      </ul>
     *      <script>
     *          Ink.requireModules( ['Ink.Dom.Selector_1','Ink.UI.TreeView_1'], function( Selector, TreeView ){
     *              var treeViewElement = Ink.s('.ink-tree-view');
     *              var treeViewObj = new TreeView( treeViewElement );
     *          });
     *      </script>
     * 
     * @sample Ink_UI_TreeView_1.html
     */
    var TreeView = function(selector, options){
        this._element = Common.elOrSelector(selector, '[Ink.UI.TreeView_1]');

        this._options = Common.options('Treeview', {
            'node':   ['String', 'li'],
            // [3.0.1] Deprecate this terrible, terrible name
            'child':  ['String',null],
            'children':  ['String','ul'],
            'parentClass': ['String','parent'],
            'openNodeClass': ['String', 'open'],
            'openClass': ['String','fa fa-minus-circle'],
            'closedClass': ['String','fa fa-plus-circle'],
            'hideClass': ['String','hide-all'],
            'iconTag': ['String', 'i'],
            'stopDefault' : ['Boolean', true]
        }, options || {}, this._element);

        if (this._options.child) {
            Ink.warn('Ink.UI.TreeView: options.child is being renamed to options.children.');
            this._options.children = this._options.child;
        }

        this._init();
    };

    TreeView.prototype = {

        /**
         * Init function called by the constructor. Sets the necessary event handlers.
         * 
         * @method _init
         * @private
         */
        _init: function(){
            this._handlers = {
                click: Ink.bindEvent(this._onClick,this)
            };

            Event.on(this._element, 'click', this._options.node, this._handlers.click);

            InkArray.each(Ink.ss(this._options.node, this._element), Ink.bind(function(item){
                if( this.isParent(item) ) {
                    Css.addClassName(item, this._options.parentClass);

                    var isOpen = this.isOpen(item);
                    if( !this._getIcon(item) ){
                        Element.create(this._options.iconTag, { insertTop: item });
                    }

                    this._setNodeOpen(item, isOpen);
                }
            },this));

            Common.registerInstance(this, this._element);
        },

        _getIcon: function (node) {
            return Ink.s('> ' + this._options.iconTag, node);
        },

        /**
         * Checks if a node is open.
         *
         * @method isOpen
         * @param {DOMElement} node  The tree node to check
         **/
        isOpen: function (node) {
            if (!this._getChild(node)) {
                throw new Error('not a node!');
            }

            return Element.data(node).open === 'true' ||
                Css.hasClassName(node, this._options.openNodeClass);
        },

        /**
         * Checks if a node is a parent.
         *
         * @method isParent
         * @param {DOMElement} node     Node to check
         **/
        isParent: function (node) {
            return Css.hasClassName(node, this._options.parentClass) ||
                this._getChild(node) != null;
        },

        _setNodeOpen: function (node, beOpen) {
            var child = this._getChild(node);
            if (child) {
                Css.setClassName(child, this._options.hideClass, !beOpen);
                var icon = this._getIcon(node);

                node.setAttribute('data-open', beOpen);

                /*
                 * Don't refactor this to
                 *
                 * setClassName(el, className, status); setClassName(el, className, !status);
                 *
                 * because it won't work with multiple classes.
                 *
                 * Doing:
                 * setClassName(el, 'fa fa-whatever', true);setClassName(el, 'fa fa-whatever-else', false);
                 *
                 * will remove 'fa' although it is a class we want.
                 */

                var toAdd = beOpen ? this._options.openClass : this._options.closedClass;
                var toRemove = beOpen ? this._options.closedClass : this._options.openClass;
                Css.removeClassName(icon, toRemove);
                Css.addClassName(icon, toAdd);

                Css.setClassName(node, this._options.openNodeClass, beOpen);
            } else {
                Ink.error('Ink.UI.TreeView: node', node, 'is not a node!');
            }
        },

        /**
         * Opens one of the tree nodes
         *
         * Make sure you pass the node's DOMElement
         * @method open
         * @param {DOMElement} node     The node you wish to open.
         **/
        open: function (node) {
            this._setNodeOpen(node, true);
        },

        /**
         * Closes one of the tree nodes
         *
         * Make sure you pass the node's DOMElement
         * @method close
         * @param {DOMElement} node     The node you wish to close.
         **/
        close: function (node) {
            this._setNodeOpen(node, false);
        },

        /**
         * Toggles a node state
         *
         * @method toggle
         * @param {DOMElement} node     The node to toggle.
         **/
        toggle: function (node) {
            if (this.isOpen(node)) {
                this.close(node);
            } else {
                this.open(node);
            }
        },

        _getChild: function (node) {
            return Selector.select(this._options.children, node)[0] || null;
        },

        /**
         * Handles the click event (as specified in the _init function).
         * 
         * @method _onClick
         * @param {Event} event
         * @private
         */
        _onClick: function(ev){
            /**
             * Summary:
             * If the clicked element is a "node" as defined in the options, will check if it has any "child".
             * If so, will toggle its state and stop the event's default behavior if the stopDefault option is true.
             **/

            if (!this.isParent(ev.currentTarget) ||
                    Selector.matchesSelector(ev.target, this._options.node) ||
                    Selector.matchesSelector(ev.target, this._options.children)) {
                return;
            }

            if (this._options.stopDefault){
                ev.preventDefault();
            }

            this.toggle(ev.currentTarget);
        }
    };

    return TreeView;
});

Ink.createModule('Ink.UI.Upload', '1', [
    'Ink.Dom.Event_1',
    'Ink.Dom.Element_1',
    'Ink.Dom.Browser_1',
    'Ink.UI.Common_1'
], function(Event, Element, Browser, Common) {
    'use strict';

    var DirectoryReader = function(options) {
        this.init(options);
    };

    DirectoryReader.prototype = {
        init: function(options) {
            this.options = Ink.extendObj({
                entry:      undefined,
                maxDepth:   10
            }, options || {});

            try {
                this._read();
            } catch(e) {
                Ink.error(e);
            }
        },


        _read: function() {
            if(!this.options.entry) {
                throw("The entry specify you must");
            }

            try {
                this._readDirectories();
            } catch(e) {
                Ink.error(e);
            }
        },


        _readDirectories: function() {
            var entries         = [],
                running         = false,
                maxDepth        = 0;

            /* TODO return as tree because much better well */
            var _readEntries = Ink.bind(function(currentEntry) {
                var dir     = currentEntry.createReader();
                    running = true;

                dir.readEntries(Ink.bind(function(res) {
                    if(res.length > 0) {
                        for(var i = 0, len = res.length; i<len; i++) {
                            entries.push(res[i]);
                            if(!res[i].isDirectory) {
                                continue;
                            }
                            maxDepth = this.clearArray(res[i].fullPath.split('/'));
                            maxDepth.shift();
                            maxDepth = maxDepth.length;
                            if(maxDepth <= this.options.maxDepth) {
                                _readEntries(res[i]);
                            }
                        }
                        if(this._stopActivityTimeout) {
                            clearTimeout(this._stopActivityTimeout);
                        }
                        this._stopActivityTimeout = setTimeout(function() {
                            running = false;
                        }, 250);
                    }
                    if(!res.length) {
                        running = false;
                    }
                }, this), Ink.bind(function(err) {
                    this.options.readError(err, currentEntry);
                }, this));
            }, this);

            _readEntries(this.options.entry);

            var activity;
            var checkActivity = function() {
                if(running) {
                    return false;
                }
                clearInterval(activity);
                if(this.options.readComplete && typeof this.options.readComplete === 'function') {
                    this.options.readComplete(entries);
                }
                return true;
            };

            activity = setInterval(Ink.bind(checkActivity, this), 250);
        },


        clearArray: function(arr) {
            for(var i = arr.length - 1; i>=0; i--) {
                if(typeof(arr[i]) === 'undefined' || arr[i] === null || arr[i] === '') {
                    arr.splice(i, 1);
                }
            }
            return arr;
        }
    };

    var Queue = {
        lists:  [],
        items:  [],


        /**
         * Create new queue list
         * @function create
         * @public
         * @param {String} list name
         * @param {Function} function to iterate on items
         * @return {Object} list id
        */
        create: function(name) {
            var id;
                name = String(name);
            this.lists.push({name: name});
            id = this.lists.length - 1;
            return id;
        },


        getItems: function(parentId) {
            if(!parentId) {
                return this.items;
            }
            var items = [];
            for(var i = 0, len = this.items.length; i<len; i++) {
                if(this.items[i].parentId === parentId) {
                    items.push(this.items[i]);
                }
            }

            return items;
        },


        /**
         * Delete list
         * @function purge
         * @public
         * @param {String} List name
         * @return {Object} removed list
        */
        purge: function(id, keepList) {
            if(typeof(id) !== 'number' || isNaN(Number(id))) {
                return false;
            }
            try {
                for(var i = this.items.length; i>=0; i--) {
                    if(this.items[i] && id === this.items[i].parentId) {
                        this.remove(this.items[i].parentId, this.items[i].pid);
                    }
                }
                if(!keepList) {
                    this.lists.splice(id, 1);
                }
                return true;
            } catch(e) {
                Ink.error('Purge: invalid id');
                return false;
            }
        },


        /**
         * add an item to a list
         * @function add
         * @public
         * @param {String} name
         * @param {Object} item
         * @return {Number} pid
        */
        add: function(parentId, item, priority) {
            if(!this.lists[parentId]) {
                return false;
            }
            if(typeof(item) !== 'object') {
                item = String(item);
            }

            var pid = parseInt(Math.round(Math.random() * 100000) + "" + Math.round(Math.random() * 100000), 10);
            priority    = priority || 0;

            this.items.push({parentId: parentId, item: item, priority: priority || 0, pid: pid});
            return pid;
        },


        /**
         * View list
         * @function view
         * @public
         * @param {Number} list id
         * @param {Number} process id
         * @return {Object} item
        */
        view: function(parentId, pid) {
            var id = this._searchByPid(parentId, pid);
            if(id === false) {
                return false;
            }
            return this.items[id];
        },


        /**
         * Remove an item
         * @function remove
         * @public
         * @param {Object} item
         * @return {Object|Boolean} removed item or false if not found
        */
        remove: function(parentId, pid) {
            try {
                var id = this._searchByPid(parentId, pid);
                if(id === false) {
                    return false;
                }
                this.items.splice(id, 1);
                return true;
            } catch(e) {
                Ink.error('Remove: invalid id');
                return false;
            }
        },

        _searchByPid: function(parentId, pid) {
            if(!parentId && typeof(parentId) === 'boolean' || !pid) {
                return false;
            }

            parentId    = parseInt(parentId, 10);
            pid         = parseInt(pid, 10);

            if(isNaN(parentId) || isNaN(pid)) {
                return false;
            }

            for(var i = 0, len = this.items.length; i<len; i++) {
                if(this.items[i].parentId === parentId && this.items[i].pid === pid) {
                    return i;
                }
            }
            return false;
        }
    };

    var UI = function(Upload) {
        this.Upload = Upload;
        this.init();
    };

    UI.prototype = {
        init: function() {
            this._fileButton = this.Upload.options.fileButton;
            this._dropzone = this.Upload.options.dropzone;
            this._setDropEvent();
            this._setFileButton();
        },


        _setDropEvent: function() {
            var dropzones = this._dropzone;
            for(var i = 0, len = dropzones.length; i<len; i++) {
                dropzones[i].ondrop        = Ink.bindEvent(this.Upload._dropEventHandler, this.Upload);
                dropzones[i].ondragleave   = Ink.bindEvent(this._onDragLeave, this);
                dropzones[i].ondragend     = Ink.bindEvent(this._onDragEndEventHandler, this);
                dropzones[i].ondragenter   = Ink.bindEvent(this._onDragEnterHandler, this);
                dropzones[i].ondragover    = Ink.bindEvent(this._onDragOverHandler, this);
            }
        },


        _onDragEnterHandler: function(ev) {
            if(ev && ev.stopPropagation) {
                ev.stopPropagation();
            }
            if(ev && ev.preventDefault) {
                ev.preventDefault();
            }
            if(ev) {
                ev.returnValue = false;
            }

            this.Upload.publish('DragEnter', ev);
            return false;
        },


        _onDragOverHandler: function(ev) {
            if(!ev) {
                return false;
            }
            ev.preventDefault();
            ev.stopPropagation();
            ev.returnValue = false;
            return true;
        },


        _onDragLeave: function(ev) {
            return this.Upload.publish('DragLeave', ev);
        },


        _onDragEndEventHandler: function(ev) {
            return this.Upload.publish('DragEnd', ev);
        },


        _setFileButton: function() {
            var btns = this._fileButton;
            Event.observeMulti(btns, 'change', Ink.bindEvent(this._fileChangeHandler, this));
        },


        _fileChangeHandler: function(ev) {
            var btn = Event.element(ev);
            var files = btn.files;
            var form = Element.findUpwardsByTag(btn, 'form');

            if(!files || !window.FormData || !('withCredentials' in new XMLHttpRequest())) {
                form.parentNode.submit();
                return false;
            }
            this.Upload._addFilesToQueue(files);
            btn.value = "";
        }
    };






    var Upload = function(options) {
        this.Queue = Queue;
        this.init(options);
        this._events = {};
    };

    Upload.prototype = {
        //_events: {},

        init: function(options) {
            if (typeof options === 'string') {
                options = Element.data(Common.elOrSelector(options, '1st argument'));
            }
            this.options = Ink.extendObj({
                extraData:          {},
                fileFormName:       'Ink_Filelist',
                dropzone:           undefined,
                fileButton:         undefined,
                endpoint:           '',
                endpointChunk:      '',
                endpointChunkCommit:'',
                maxFilesize:        300 << 20, //300mb
                chunkSize:          4194304,  // 4MB
                minSizeToUseChunks: 20971520, // 20mb
                INVALID_FILE_NAME:  undefined,
                foldersEnabled:     true,
                useChunks:          true,
                directoryMaxDepth:  10
            }, options || {});

            this._queueId           = Queue.create('Ink_UPLOAD');
            this._queueRunning      = false;
            this._folders           = {};


            if(this.options.dropzone) {
                Common.elOrSelector(this.options.dropzone, 'Upload - dropzone');
            }

            if(this.options.fileButton) {
                Common.elOrSelector(this.options.fileButton, 'Upload - fileButton');
            }

            if(!this.options.dropzone && ! this.options.fileButton) {
                throw new TypeError('A file button or dropzone, specify you must, my young padawan');
            }

            this.options.dropzone = Ink.ss(this.options.dropzone);
            this.options.fileButton= Ink.ss(this.options.fileButton);

            new UI(this);
        },


        _supportChunks: function(size) {
            return this.options.useChunks &&
                    'Blob' in window &&
                    (new Blob()).slice &&
                    size > this.options.minSizeToUseChunks;
        },


        _dropEventHandler: function(ev) {
            if(ev && ev.stopPropagation) {
                ev.stopPropagation();
            }
            if(ev && ev.preventDefault) {
                ev.preventDefault();
            }
            if(ev) {
                ev.returnValue = false;
            }

            this.publish('DropComplete', ev.dataTransfer);

            var data = ev.dataTransfer;

            if(!data || !data.files || !data.files.length) {
                return false;
            }

            this._files = data.files;
            this._files = Array.prototype.slice.call(this._files || [], 0);

            // check if webkitGetAsEntry exists on first item
            if(data.items && data.items[0] && data.items[0].webkitGetAsEntry) {
                if(!this.options.foldersEnabled) {
                    return setTimeout(Ink.bind(this._addFilesToQueue, this, this._files), 0);
                }
                var entry, folders = [];
                for(var i = ev.dataTransfer.items.length-1; i>=0; i--) {
                    entry = ev.dataTransfer.items[i].webkitGetAsEntry();
                    if(entry && entry.isDirectory) {
                        folders.push(entry);
                        this._files[i].isDirectory = true;
                        this._files.splice(i, 1);
                    }
                }
                // starting callback hell
                this._addFolderToQueue(folders, Ink.bind(function() {
                    setTimeout(Ink.bind(this._addFilesToQueue, this, this._files), 0);
                }, this));
            } else {
                setTimeout(Ink.bind(this._addFilesToQueue, this, this._files), 0);
            }

            return true;
        },


        _addFolderToQueue: function(folders, cb) {
            var files = [], invalidFolders = {};

            if(!folders || !folders.length) {
                cb();
                return files;
            }

            var getFiles = function(entries) {
                var files = [];
                for(var i = 0, len = entries.length; i<len; i++) {
                    if(entries[i].isFile) {
                        files.push(entries[i]);
                    }
                }
                return files;
            };

            var convertToFile = function(cb, index) {
                var fullPath;
                index = index || 0;
                if(!this._files[index]) {
                    cb();
                    return files;
                }
                if(this._files[index].constructor.name.toLowerCase() !== 'fileentry') {
                    return convertToFile.apply(this, [cb, ++index]);
                }
                this._files[index].file(Ink.bind(function(res) {
                    fullPath = this._files[index].fullPath; // bug
                    this._files[index]              = res;
                    this._files[index].hasParent    = true;

                    // if browser don't have it natively, set it
                    if(!this._files[index].fullPath) {
                        this._files[index].fullPath = fullPath;
                    }
                    convertToFile.apply(this, [cb, ++index]);
                }, this), Ink.bind(function() {
                    this._files.splice(index, 1);
                    convertToFile.apply(this, [cb, index]);
                }, this));
            };

            var getSubDirs = Ink.bind(function(index) {
                if(!folders[index]) {
                    this._files = this._files.concat(files);
                    convertToFile.call(this, cb);
                    return false;
                }

                new DirectoryReader({
                    entry:      folders[index],
                    maxDepth:   this.options.directoryMaxDepth,
                    readComplete: Ink.bind(function(entries) {
                        files = files.concat(getFiles(entries));
                        // adding root dirs
                        if(!folders[index] || folders[index].fullPath in this._folders) {
                            return;
                        }

                        this._folders[folders[index].fullPath] = {
                            items:      entries,
                            files:      files,
                            length:     entries.length,
                            created:    false,
                            root:       true
                        };

                        // adding sub dirs
                        for(var i = 0, len = entries.length; i<len; i++) {
                            if(entries[i].isFile) {
                                continue;
                            }
                            if(entries[i].fullPath in invalidFolders) {
                                delete invalidFolders[entries[i].fullPath];
                                continue;
                            }
                            this._folders[entries[i].fullPath] = {
                                created:    false,
                                root:       false
                            };
                        }
                        getSubDirs(++index);
                    }, this),
                    readError: Ink.bind(function(err, dir) {
                        invalidFolders[dir.fullPath] = {};
                        invalidFolders[dir.fullPath].error = err;
                    }, this)
                });
            }, this);

            getSubDirs(0);
            return files;
        },


        _addFilesToQueue: function(files) {
            var file, fileID, o;
            for(var i = 0, len = files.length; i<len; i++) {
                file = files[i];

                if(!file.isDirectory) {
                    // dirty hack to allow 0B files avoiding folders on GECKO
                    if(file === null || (!file.type && file.size % 4096 === 0 && (!Browser.CHROME || !this.options.foldersEnabled))) {
                        this.publish('InvalidFile', file, 'size');
                        continue;
                    }
                }

                if(file.size > this.options.maxFilesize) {
                    this.publish('MaxSizeFailure', file, this.options.maxFilesize);
                    continue;
                }

                fileID = parseInt(Math.round(Math.random() * 100000) + "" + Math.round(Math.random() * 100000), 10);
                o = { id: i, data: file, fileID: fileID, directory: file.isDirectory };
                Queue.add(this._queueId, o);

                this.publish('FileAddedToQueue', o);
            }
            this._processQueue(true);
            this._files = [];
        },


        _processQueue: function(internalUpload) {
            if(this._queueRunning) {
                return false;
            }

            this.running = 0;
            var max = 1, i = 0, items,
                queueLen = Queue.items.length;
            this._queueRunning = true;

            this.interval = setInterval(Ink.bind(function() {
                if(Queue.items.length === i && this.running === 0) {
                    Queue.purge(this._queueId, true);
                    this._queueRunning = false;
                    clearInterval(this.interval);
                    this.publish('QueueEnd', this._queueId, queueLen);
                }

                items = Queue.getItems(this._queueId);

                if(this.running < max && items[i]) {
                    if(!items[i].canceled) {
                        _doRequest.call(this, items[i].pid, items[i].item.data, items[i].item.fileID, items[i].item.directory, internalUpload);
                        this.running++;
                        i++;
                    } else {
                        var j = i;
                        while(items[j] && items[j].canceled) {
                            i++;
                            j++;
                        }
                    }
                    return true;
                }
                return false;
            }, this), 100);


            var _doRequest = function(pid, data, fileID, directory, internalUpload) {
                var o = {
                    file:   data,
                    fileID: fileID,
                    cb: Ink.bind(function() {
                        this.running--;
                    }, this)
                };
                if(internalUpload) {
                    if(directory) {
                        // do magic
                        o.cb();
                    } else {
                        this._upload(o);
                    }
                }
            };

            return true;
        },


        _upload: function(o) {
            var file = o.file,
                xhr = new XMLHttpRequest(),
                fileID = o.fileID;

            this.publish('BeforeUpload', file, this.options.extraData, fileID, xhr, this._supportChunks(file.size));

            var forceAbort = function(showError) {
                if(o.cb && typeof(o.cb === 'function')) {
                    o.cb();
                }

                this.publish('OnProgress', {
                    length: file.size,
                    lengthComputable: true,
                    loaded: file.size,
                    total: file.size
                }, file, fileID);
                this.publish('EndUpload', file, fileID, (showError ? { error: true } : true));
                this.publish('InvalidFile', file, 'name');
                xhr.abort();
            };

            if(this.options.INVALID_FILE_NAME && this.options.INVALID_FILE_NAME instanceof RegExp) {
                if(this.options.INVALID_FILE_NAME.test(o.file.name)) {
                    forceAbort.call(this);
                    return;
                }
            }

            // If file was renamed, abort it
            // FU OPERA: Opera always return lastModified date as null
            if(!file.lastModifiedDate && !Ink.Dom.Browser.OPERA) {
                forceAbort.call(this, true);
                return;
            }

            xhr.upload.onprogress = Ink.bind(this.publish, this, 'OnProgress', file, fileID);

            var endpoint, method;
            if(this._supportChunks(file.size)) {
                if(file.size <= file.chunk_offset) {
                    endpoint = this.options.endpointChunkCommit;
                    method = 'POST';
                } else {
                    endpoint = this.options.endpointChunk;
                    if(file.chunk_upload_id) {
                        endpoint += '?upload_id=' + file.chunk_upload_id;
                    }
                    if(file.chunk_offset) {
                        endpoint += '&offset=' + file.chunk_offset;
                    }
                    method = 'PUT';
                }
            } else {
                endpoint = this.options.endpoint;
                method = 'POST';
            }

            xhr.open(method, endpoint, true);
            xhr.withCredentials = true;
            xhr.setRequestHeader("x-requested-with", "XMLHttpRequest");
            if(this._supportChunks(file.size)) {
                xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
            }

            var fd = new FormData(),
                blob;

            if("Blob" in window && typeof Blob === 'function') {
                blob = new Blob([file], { type: file.type });
                if(this._supportChunks(file.size)) {
                    file.chunk_offset = file.chunk_offset || 0;
                    blob = blob.slice(file.chunk_offset, file.chunk_offset + this.options.chunkSize);
                } else {
                    fd.append(this.options.fileFormName, blob, file.name);
                }
            } else {
                fd.append(this.options.fileFormName, file);
            }

            if(!this._supportChunks(file.size)) {
                for(var k in this.options.extraData) {
                    if(this.options.extraData.hasOwnProperty(k)) {
                        fd.append(k, this.options.extraData[k]);
                    }
                }
            } else {
                fd.append('upload_id', file.chunk_upload_id);
                fd.append('path', file.upload_path);
            }

            if(!file.hasParent) {
                if(!this._supportChunks(file.size)) {
                    xhr.send(fd);
                } else {
                    if(file.size <= file.chunk_offset) {
                        xhr.send('upload_id=' + file.chunk_upload_id + '&path=' + file.upload_path + '/' + file.name);
                    } else {
                        xhr.send(blob);
                    }
                }
            } else {
                this.publish('cbCreateFolder', file.parentID, file.fullPath, this.options.extraData, this._folders, file.rootPath, Ink.bind(function() {
                    if(!this._supportChunks(file.size)) {
                        xhr.send(fd);
                    } else {
                        if(file.size <= file.chunk_offset) {
                            xhr.send('upload_id=' + file.chunk_upload_id + '&path=' + file.upload_path + '/' + file.name);
                        } else {
                            xhr.send(blob);
                        }
                    }
                }, this));
            }


            xhr.onload = Ink.bindEvent(function() {
                /* jshint boss:true */
                if(this._supportChunks(file.size) && file.size > file.chunk_offset) {
                    if(xhr.response) {
                        var response = JSON.parse(xhr.response);

                        // check expected offset
                        var invalidOffset = file.chunk_offset && response.offset !== (file.chunk_offset + this.options.chunkSize) && file.size !== response.offset;
                        if(invalidOffset) {
                            if(o.cb) {
                                o.cb();
                            }
                            this.publish('ErrorUpload', file, fileID);
                        } else {
                            file.chunk_upload_id = response.upload_id;
                            file.chunk_offset = response.offset;
                            file.chunk_expires = response.expires;
                            this._upload(o);
                        }
                    } else {
                        if(o.cb) {
                            o.cb();
                        }
                        this.publish('ErrorUpload', file, fileID);
                    }
                    return (xhr = null);
                }

                if(o.cb) {
                    o.cb();
                }

                if(xhr.responseText && xhr['status'] < 400) {
                    this.publish('EndUpload', file, fileID, xhr.responseText);
                } else {
                    this.publish('ErrorUpload', file, fileID);
                }
                return (xhr = null);
            }, this);


            xhr.onerror = Ink.bindEvent(function() {
                if(o.cb) {
                    o.cb();
                }
                this.publish('ErrorUpload', file, fileID);
            }, this);

            xhr.onabort = Ink.bindEvent(function() {
                if(o.cb) {
                    o.cb();
                }
                this.publish('AbortUpload', file, fileID, {
                    abortAll: Ink.bind(this.abortAll, this),
                    abortOne: Ink.bind(this.abortOne, this)
                });
            }, this);
        },


        abortAll: function() {
            if(!this._queueRunning) {
                return false;
            }
            clearInterval(this.interval);
            this._queueRunning = false;
            Queue.purge(this._queueId, true);
            return true;
        },

        abortOne: function(id, cb) {
            var items = Queue.getItems(0),
                o;
            for(var i = 0, len = items.length; i<len; i++) {
                if(items[i].item.fileID === id) {
                    o = {
                        id:         items[i].item.fileID,
                        name:       items[i].item.data.name,
                        size:       items[i].item.data.size,
                        hasParent:  items[i].item.data.hasParent
                    };
                    Queue.remove(0, items[i].pid);
                    if(cb) {
                        cb(o);
                    }
                    return true;
                }
            }
            return false;
        },


        subscribe: function(eventName, fn) {
            if(!this._events[eventName]) {
                this._events[eventName] = [];
            }
            this._events[eventName].push(fn);
            return this._events[eventName];
        },


        publish: function(eventName) {
            var events = this._events[eventName],
                args = Array.prototype.slice.call(arguments || [], 0);

            if(!events) {
                return;
            }

            for(var i = 0, len = events.length; i<len; i++) {
                try {
                    events[i].apply(this, args.splice(1, args.length));
                } catch(err) {
                    Ink.error(eventName + ": " + err);
                }
            }
        }
    };

    return Upload;
});
