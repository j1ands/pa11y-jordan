// This file is part of pa11y.
//
// pa11y is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// pa11y is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with pa11y.  If not, see <http://www.gnu.org/licenses/>.

// jshint maxstatements: false
// jscs:disable disallowMultipleVarDecl, maximumLineLength
'use strict';

var assert = require('proclaim');
var jsdom = require('jsdom');

describe('lib/inject', function() {
	var inject, options, window;

	beforeEach(function() {
		window = require('../mock/window');
		options = {
			ignore: [],
			standard: 'FOO-STANDARD',
			wait: 0
		};
		inject = require('../../../lib/inject');
	});

	it('should be a function', function() {
		assert.isFunction(inject);
	});

	it('should process the page with HTML CodeSniffer', function(done) {
		inject(window, options, function() {
			assert.calledOnce(window.HTMLCS.process);
			assert.calledWith(window.HTMLCS.process, 'FOO-STANDARD', window.document);
			done();
		});
	});

	it('should wait before processing the page if `options.wait` is set', function(done) {
		// Note: this test isn't particularly reliable, revisit some time
		var start = Date.now();
		options.wait = 10;
		inject(window, options, function() {
			var end = Date.now() - start;
			assert.greaterThanOrEqual(end, 10);
			done();
		});
	});

	it('should get the HTML CodeSniffer messages after processing the page', function(done) {
		inject(window, options, function() {
			assert.calledOnce(window.HTMLCS.getMessages);
			assert.callOrder(
				window.HTMLCS.process,
				window.HTMLCS.getMessages
			);
			done();
		});
	});

	it('should callback with the messages reformatted for pa11y', function(done) {
		window.HTMLCS.getMessages.returns([
			{
				code: 'foo-code',
				element: {
					innerHTML: 'foo inner',
					outerHTML: '<element>foo inner</element>'
				},
				msg: 'foo message',
				type: 1
			},
			{
				code: 'bar-code',
				element: {
					innerHTML: 'bar inner at more than 30 characters long',
					outerHTML: '<element>bar inner at more than 30 characters long</element>'
				},
				msg: 'bar message',
				type: 2
			},
			{
				code: 'baz-code',
				element: {
					innerHTML: 'baz inner',
					outerHTML: '<element with="loads of attributes" that="push the total outerHTML length" to="more than we really want to send back to Node.js" this="is getting kind of silly now, I really want to stop writing dummy text to push the length of this element out">baz inner</element>'
				},
				msg: 'baz message',
				type: 3
			}
		]);
		inject(window, options, function(result) {
			assert.isDefined(result.messages);
			assert.deepEqual(result.messages, [
				{
					code: 'foo-code',
					context: '<element>foo inner</element>',
					message: 'foo message',
					selector: '',
					type: 'error',
					typeCode: 1
				},
				{
					code: 'bar-code',
					context: '<element>bar inner at more than 30 chara...</element>',
					message: 'bar message',
					selector: '',
					type: 'warning',
					typeCode: 2
				},
				{
					code: 'baz-code',
					context: '<element with=\"loads of attributes\" that=\"push the total outerHTML length\" to=\"more than we really want to send back to Node.js\" this=\"is getting kind of silly now, I really want to stop writing dummy text to push the length of this element out\">baz ...',
					message: 'baz message',
					selector: '',
					type: 'notice',
					typeCode: 3
				}
			]);
			done();
		});
	});

	it('should ignore messages when their code appears in `options.ignore`', function(done) {
		options.ignore.push('foo-code');
		window.HTMLCS.getMessages.returns([
			{
				code: 'Foo-Code',
				element: {
					innerHTML: 'foo inner',
					outerHTML: '<element>foo inner</element>'
				},
				msg: 'foo message',
				type: 1
			},
			{
				code: 'bar-code',
				element: {
					innerHTML: 'bar inner at more than 30 characters long',
					outerHTML: '<element>bar inner at more than 30 characters long</element>'
				},
				msg: 'bar message',
				type: 2
			}
		]);
		inject(window, options, function(result) {
			assert.isDefined(result.messages);
			assert.deepEqual(result.messages, [
				{
					code: 'bar-code',
					context: '<element>bar inner at more than 30 chara...</element>',
					message: 'bar message',
					selector: '',
					type: 'warning',
					typeCode: 2
				}
			]);
			done();
		});
	});

	it('should ignore messages when their type appears in `options.ignore`', function(done) {
		options.ignore.push('warning');
		window.HTMLCS.getMessages.returns([
			{
				code: 'foo-code',
				element: {
					innerHTML: 'foo inner',
					outerHTML: '<element>foo inner</element>'
				},
				msg: 'foo message',
				type: 1
			},
			{
				code: 'bar-code',
				element: {
					innerHTML: 'bar inner at more than 30 characters long',
					outerHTML: '<element>bar inner at more than 30 characters long</element>'
				},
				msg: 'bar message',
				type: 2
			}
		]);
		inject(window, options, function(result) {
			assert.isDefined(result.messages);
			assert.deepEqual(result.messages, [
				{
					code: 'foo-code',
					context: '<element>foo inner</element>',
					message: 'foo message',
					selector: '',
					type: 'error',
					typeCode: 1
				}
			]);
			done();
		});
	});

	it('should handle malformed messages and elements', function(done) {
		window.HTMLCS.getMessages.returns([
			{
				code: 'foo-code',
				element: {},
				msg: 'foo message',
				type: 4
			}
		]);
		inject(window, options, function(result) {
			assert.isDefined(result.messages);
			assert.deepEqual(result.messages, [
				{
					code: 'foo-code',
					context: null,
					message: 'foo message',
					selector: '',
					type: 'unknown',
					typeCode: 4
				}
			]);
			done();
		});
	});

	it('should generate CSS selectors for elements', function(done) {
		var html = [
			'<body>',
				'<div>',
					'<div id="foo">',
						'<p class="foo1">1</p>',
						'<p id="foo2" class="foo2">2</p>',
						'<p class="foo3">3</p>',
					'</div>',
				'</div>',
				'<div id="bar">',
					'<p class="bar1">1</p>',
					'<div class="bar2"></div>',
				'</div>',
			'</body>'
		].join('');
		jsdom.env(html, [], function(error, jsdomWindow) {
			assert.isNull(error);
			window.HTMLCS.getMessages.returns([
				{
					code: 'foo-code',
					element: jsdomWindow.document.querySelector('.foo3'),
					msg: 'foo message',
					type: 1
				},
				{
					code: 'bar-code',
					element: jsdomWindow.document.querySelector('.foo2'),
					msg: 'bar message',
					type: 1
				},
				{
					code: 'baz-code',
					element: jsdomWindow.document.querySelector('.bar1'),
					msg: 'baz message',
					type: 1
				}
			]);
			inject(window, options, function(result) {
				assert.isDefined(result.messages);
				assert.deepEqual(result.messages, [
					{
						code: 'foo-code',
						context: '<p class="foo3">3</p>',
						message: 'foo message',
						selector: '#foo > p:nth-child(3)',
						type: 'error',
						typeCode: 1
					},
					{
						code: 'bar-code',
						context: '<p id="foo2" class="foo2">2</p>',
						message: 'bar message',
						selector: '#foo2',
						type: 'error',
						typeCode: 1
					},
					{
						code: 'baz-code',
						context: '<p class="bar1">1</p>',
						message: 'baz message',
						selector: '#bar > p',
						type: 'error',
						typeCode: 1
					}
				]);
				done();
			});
		});
	});

	it('should callback with an error message if HTML CodeSniffer throws', function(done) {
		window.HTMLCS.process.throws(new Error('Oopsie'));
		inject(window, options, function(result) {
			assert.isDefined(result.error);
			assert.strictEqual(result.error, 'HTML CodeSniffer: Oopsie');
			done();
		});
	});

});
