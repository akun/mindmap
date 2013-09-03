from setuptools import setup, find_packages


setup(
	name = 'djmm',
	version = 'alpha',
	url = 'https://github.com/akun/mindmup',
	description = 'a FreeMind like mind map online, forked from mindmup, using Django as Web Framework',
	packages = find_packages('src'),
	package_dir = {'': 'src'},
	install_requires = [
		'setuptools',
		'django == 1.5.2',
		'requests == 1.2.3',
	],
)
