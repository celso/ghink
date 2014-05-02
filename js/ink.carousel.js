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
