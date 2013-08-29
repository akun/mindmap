/*global jQuery,document, _*/
jQuery.fn.contextMenuWidget = function (mapModel) {
	'use strict';
	var content = this.find('[data-mm-context-menu]').clone(),
		element = jQuery('<ul class="dropdown-menu">').css('position', 'absolute').css('z-index', '999').hide().appendTo('body'),
		hide = function () {
			if (element.is(':visible')) {
				element.hide();
			}
			jQuery(document).off('click touch keydown', hide);
		},
		topMenus = { },
		getTopMenu = function (label) {
			if (!topMenus[label]) {
				var dropDownMenu = jQuery('<li class="dropdown-submenu"><a tabindex="-1" href="#"></a><ul class="dropdown-menu"></ul></li>').appendTo(element);
				dropDownMenu.find('a').text(label);
				topMenus[label] = dropDownMenu.find('ul');
			}
			return topMenus[label];
		};
	content.find('a').attr('data-category', 'Context Menu');
	_.each(content, function (menuItem) {
		var submenu = jQuery(menuItem).attr('data-mm-context-menu');

		if (submenu) {
			getTopMenu(submenu).append(menuItem);
		} else {
			element.append(menuItem);
		}
	});
	mapModel.addEventListener('mapMoveRequested mapScaleChanged nodeSelectionChanged nodeEditRequested', hide);
	mapModel.addEventListener('contextMenuRequested', function (nodeId, x, y) {
		element.css('left', x).css('top', y - 10).css('display', 'block').show();
		if (element.offset().top + element.outerHeight() > jQuery(window).height() - 20) {
			element.css('top', jQuery(window).height() - 20 - element.outerHeight());
		}
		if (element.offset().left + (2 * element.outerWidth()) > jQuery(window).width() - 20) {
			element.find('.dropdown-submenu').addClass('pull-left');
		} else {
			element.find('.dropdown-submenu').removeClass('pull-left');
		}
		if (element.offset().left + (element.outerWidth()) > jQuery(window).width() - 20) {
			element.css('left', jQuery(window).width() - 20 - (element.outerWidth()));
		}
		jQuery(document).off('click', hide);
		element.on('mouseenter', function () {
			jQuery(document).off('click', hide);
		});
		element.on('mouseout', function () {
			jQuery(document).on('click', hide);
		});
		jQuery(document).on('touch keydown', hide);
	});
	return element;
};
