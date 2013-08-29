import os

from django import template
register = template.Library()
from django.http import Http404
from django.conf import settings



# TODO remove me, and join scripts using Grunt
@register.filter
def join_scripts(script_url_array):

    script_url_array = [
        'mapjs-compiled',
        'class-caching-widget',
        'navigation',
        'maps',
        'activity-log',
        'alert',
        'map-controller',
        's3-adapter',
        'google-drive-adapter',
        'offline-adapter',
        'feedback',
        'vote',
        'welcome-message',
        'floating-toolbar',
        'bookmark',
        'title-update-widget',
        'share-widget',
        'share-email-widget',
        'background-upload-widget',
        'file-reader-upload-widget',
        'import-widget',
        'toggle-class-widget',
        'url-shortener-widget',
        'save-widget',
        'remote-export-widget',
        'google-drive-open-widget',
        'local-storage-open-widget',
        'command-line-widget',
        'freemind-import',
        'tabular-export',
        'bootstrap-wysiwyg',
        'attachment-editor-widget',
        'auto-save',
        'auto-save-widget',
        'file-system-map-source',
        'retriable-map-source-decorator',
        'score',
        'extensions',
        'map-status-widget',
        'key-actions-widget',
        'context-menu-widget',
        'embed-map-widget',
        'main',
    ]

    #if settings.DEBUG:
    #    return script_url_array

    target_file = os.path.join(settings.STATICFILES_DIRS[0], '%s.js' % settings.CACHE_PREVENTION_KEY)

    if not os.path.exists(target_file):
        for input_file in script_url_array:
            infile = os.path.join(settings.STATICFILES_DIRS[0], '%s.js' % input_file)
            if not os.path.exists(infile):
                raise Http404

        with open(target_file, 'w') as output_file:
            for input_file in script_url_array:
                infile = os.path.join(settings.STATICFILES_DIRS[0], '%s.js' % input_file)
                content = open(infile).readlines()
                output_file.writelines(content)

    return '%s.js' % settings.CACHE_PREVENTION_KEY
