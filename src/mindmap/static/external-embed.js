var links = document.querySelectorAll('a[data-role=mindmup-embed]');
for (var idx = 0; idx < links.length; idx++) { 
	var link = links[idx];
	var mapid = link.getAttribute('href').replace(/.*[\/:]/,''); 
	var iframe = document.createElement('iframe'); 
	iframe.setAttribute('src', link.protocol + '//' + link.host + '/embedded/' + mapid); 
	iframe.setAttribute('width',link.getAttribute('data-width') || '100%'); 
	iframe.setAttribute('height', link.getAttribute('data-height') || '500'); 
	iframe.setAttribute('frameborder', '0'); iframe.setAttribute('marginwidth','0'); 
	iframe.setAttribute('marginheight','0'); iframe.setAttribute('scrolling','no');
	iframe.setAttribute('style', link.getAttribute('data-style') || 'border:1px solid #CCC;margin-bottom:5px');
	link.parentNode.replaceChild (iframe, link); 
}
