/*global MM, $, _, escape*/
MM.freemindImport = function (xml, start, progress) {
	'use strict';
	var nodeStyle = function (node, parentStyle) {
		var style = {}, attachment, toStr = function (xmlObj) {
			return $('<div>').append(xmlObj).html();
		};
		if (node.attr('BACKGROUND_COLOR')) {
			style.style = {background : node.attr('BACKGROUND_COLOR')};
		}
		if ((parentStyle && parentStyle.collapsed) || node.attr('FOLDED') === 'true') {
			style.collapsed = 'true';
		}
		attachment = node.children('richcontent').find('body');
		if (attachment.length > 0) {
			style.attachment = { contentType: 'text/html', content: toStr(attachment.children()) };
		}
		return style;
	},
		result,
		xmlToJson = function (xmlNode, parentStyle) {
			var node = $(xmlNode),
				result = {'title' : node.attr('TEXT') || ''},
				childNodes = node.children('node'),
				style = nodeStyle(node, parentStyle),
				children = _.map(childNodes, function (child) {return xmlToJson(child, style); }),
				childObj = {},
				index = 1;
			if (_.size(style) > 0) {
				result.attr = style;
			}
			if (children.length > 0) {
				_.each(children, function (child) {
					var position = $(childNodes[index - 1]).attr('POSITION') === 'left' ? -1 : 1;
					childObj[position * index] = child;
					index += 1;
				});
				result.ideas = childObj;
			} else if (result.attr && result.attr.collapsed) {
				delete result.attr.collapsed;
			}
			if (progress) {
				progress();
			}
			return result;
		},
		xmlDoc = $($.parseXML(xml));
	if (start) {
		start(xmlDoc.find('node').length);
	}
	result = xmlToJson(xmlDoc.find('map').children('node').first());
	result.formatVersion = 2;
	return result;
};

/*jslint nomen: true*/
MM.freemindExport = function (idea) {
	'use strict';
	var formatNode = function (idea) {
		var escapedText = escape(idea.title).replace(/%([0-9A-F][0-9A-F])/g, '&#x$1;').replace(/%u([0-9A-F][0-9A-F][0-9A-F][0-9A-F])/g, '&#x$1;');
		return '<node ID="' + idea.id + '" TEXT="' + escapedText + '">' + (_.size(idea.ideas) > 0 ? _.map(_.sortBy(idea.ideas, function (val, key) { return parseFloat(key); }), formatNode).join('') : '') + '</node>';
	};
	return '<map version="0.7.1">' + formatNode(idea) + '</map>';
};
