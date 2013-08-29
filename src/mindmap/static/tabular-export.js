/*global MM, MAPJS, _, $, jQuery*/
MM.exportIdeas = function (contentAggregate, exporter) {
	'use strict';
	var traverse = function (iterator, idea, level) {
		level = level || 0;
		iterator(idea, level);
		_.each(idea.sortedSubIdeas(), function (subIdea) {
			traverse(iterator, subIdea, level + 1);
		});
	};
	if (exporter.begin) { exporter.begin(); }
	traverse(exporter.each, contentAggregate);
	if (exporter.end) { exporter.end(); }
	return exporter.contents();
};
MM.TabSeparatedTextExporter = function () {
	'use strict';
	var contents = [];
	this.contents = function () {
		return contents.join('\n');
	};
	this.each = function (idea, level) {
		contents.push(
			_.map(_.range(level), function () {return '\t'; }).join('') + idea.title.replace(/\t|\n|\r/g, ' ')
		);
	};
};
MM.HtmlTableExporter = function () {
	'use strict';
	var result;
	this.begin = function () {
		result = $('<table>').wrap('<div></div>'); /*parent needed for html generation*/
	};
	this.contents = function () {
		return '<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"> </head><body>' +
			$(result).parent().html() +
			'</body></html>';
	};
	this.each = function (idea, level) {
		var row = $('<tr>').appendTo(result),
			cell = $('<td>').appendTo(row).text(idea.title);
		if (idea.attr && idea.attr.style && idea.attr.style.background) {
			cell.css('background-color', idea.attr.style.background);
			cell.css('color', MAPJS.contrastForeground(idea.attr.style.background));
		}
		if (level > 0) {
			$('<td>').prependTo(row).html('&nbsp;').attr('colspan', level);
		}
	};
};
MM.exportToHtmlDocument = function (idea) {
	'use strict';
	var deferred = jQuery.Deferred(),
		createContent = function (imageUrl) {
			var result = $('<div>'), /*parent needed for html generation*/
				appendLinkOrText = function (element, text) {
					if (MAPJS.URLHelper.containsLink(text)) {
						$('<a>').attr('href', MAPJS.URLHelper.getLink(text))
							.text(MAPJS.URLHelper.stripLink(text) || text)
							.appendTo(element);
					} else {
						element.text(text);
					}
				},
				appendAttachment = function (element, anIdea) {
					var attachment = anIdea && anIdea.attr && anIdea.attr.attachment;
					if (attachment && attachment.contentType === 'text/html') {
						$('<div>').addClass('attachment').appendTo(element).html(attachment.content);
					}
				},
				toList = function (ideaList) {
					var list = $('<ul>');
					_.each(ideaList, function (subIdea) {
						var element = $('<li>').appendTo(list);
						appendLinkOrText(element, subIdea.title);
						appendAttachment(element, subIdea);
						if (subIdea.attr && subIdea.attr.style && subIdea.attr.style.background) {
							element.css('background-color', subIdea.attr.style.background);
							element.css('color', MAPJS.contrastForeground(subIdea.attr.style.background));
						}
						if (!_.isEmpty(subIdea.ideas)) {
							toList(subIdea.sortedSubIdeas()).appendTo(element);
						}
					});
					return list;
				},
				heading = $('<h1>').appendTo(result);
			if (imageUrl) {
				$('<img>').addClass('mapimage').attr('src', imageUrl).appendTo(result);
			}
			appendLinkOrText(heading, idea.title);
			appendAttachment(result, idea);
			if (!_.isEmpty(idea.ideas)) {
				toList(idea.sortedSubIdeas()).appendTo(result);
			}
			deferred.resolve('<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8">' +
				'<style type="text/css">' +
				'body{font-family:"HelveticaNeue",Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;color:#333333;margin-left:10%;margin-right:10%;}h1{display:block;font-size:38.5px;line-height:40px;font-family:inherit;}li{line-height:20px;padding-left:10px;}ul{list-style-type:none;}div.attachment{border:1px solid black;margin:5px;padding:5px;}img.mapimage{border:1px solid black;max-height:600px;max-width:600px;}</style>' +
				'</head><body>' +
				$(result).html() +
				'</body></html>', 'text/html');
		};
	MAPJS.pngExport(idea).then(createContent);
	return deferred.promise();
};
