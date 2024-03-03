==========================================
 Complete tree-sitter grammar for Jinja 2
==========================================

This repository contains a complete, and working, grammar for Jinja 2. There are several other 'implementations', but they are severely lacking and make no effort to properly capture all the nuances and complexities of Jinja 2.

This grammar does. Given the quirky nature of the language, and the complete lack of a formal specification, this grammar may be a bit more accepting than the actual language itself, particularly around expressions, which in this version is modelled on how Python does it, as that is clearly the inspiration (and source of) how Jinja itself treats expressions.

+------------------------------+------------------------------+------------------------------+
|**Language Feature**          |**Supported**                 |**Comment**                   |
+------------------------------+------------------------------+------------------------------+
|``{# #}`` comments            | ✅                           |Handles multi-line comments   |
|                              |                              |and trimming                  |
+------------------------------+------------------------------+------------------------------+
|``{{ }}`` expressions         | ✅                           |Handles trimming              |
+------------------------------+------------------------------+------------------------------+
|``{% %}`` statements          | ✅                           |Handles trimming              |
+------------------------------+------------------------------+------------------------------+
|``block`` statement           | ✅                           |                              |
+------------------------------+------------------------------+------------------------------+
|``trans`` / ``pluralize``     | ✅                           |                              |
+------------------------------+------------------------------+------------------------------+
|``include``, ``extends``      | ✅                           |Also supports inline          |
|                              |                              |expressions, like if          |
|                              |                              |statements                    |
+------------------------------+------------------------------+------------------------------+
|``import`` statement          | ✅                           |Supports regular import,      |
|                              |                              |aliased import and import     |
|                              |                              |from.                         |
+------------------------------+------------------------------+------------------------------+
|``for`` statement             | ✅                           |Supports all language         |
|                              |                              |keywords, including recursive |
|                              |                              |flag and optional conditional |
|                              |                              |clause.                       |
+------------------------------+------------------------------+------------------------------+
|``if`` statement              | ✅                           |                              |
+------------------------------+------------------------------+------------------------------+
|``macro`` / ``call`` statement| ✅                           |Also supports the callback    |
|                              |                              |version of call.              |
+------------------------------+------------------------------+------------------------------+
|``set`` statement             | ✅                           |                              |
+------------------------------+------------------------------+------------------------------+
|``with`` statement            | ✅                           |Supports commatised assignment|
|                              |                              |                              |
+------------------------------+------------------------------+------------------------------+
|``do`` statement              | ✅                           |                              |
+------------------------------+------------------------------+------------------------------+
|``autoescape``, ``raw``,      | ✅                           |                              |
|``filter``                    |                              |                              |
|statement                     |                              |                              |
+------------------------------+------------------------------+------------------------------+
|Detect ambiguous constants    | ✅                           |Such as true vs True          |
|                              |                              |                              |
+------------------------------+------------------------------+------------------------------+
|Detect unary test calls       | ✅                           |``a is divisibleby 3`` is     |
|                              |                              |correctly interpreted as a    |
|                              |                              |another way of executing a    |
|                              |                              |call with one argument.       |
+------------------------------+------------------------------+------------------------------+
|Coalesce and concatenate with | ✅                           |                              |
|``~``                         |                              |                              |
+------------------------------+------------------------------+------------------------------+
|Filtering with ``|``          | ✅                           |Proper operator precedence for|
|                              |                              |filters are applied           |
+------------------------------+------------------------------+------------------------------+
|Full Python-style expressions | ✅                           |Subscripts, calls, lists,     |
|                              |                              |tuples, dictionaries, boolean |
|                              |                              |conditionals and arithmetic,  |
|                              |                              |etc.                          |
+------------------------------+------------------------------+------------------------------+
|Line Statements               | ❌                           |See below                     |
|                              |                              |                              |
|                              |                              |                              |
|                              |                              |                              |
|                              |                              |                              |
|                              |                              |                              |
|                              |                              |                              |
+------------------------------+------------------------------+------------------------------+


This Jinja2 grammar is, therefore, quite complete.


Limitations
===========

Some grammar language features were ported directly from the Python tree-sitter grammar and then cut down to size to match what I am guessing is the extent of Jinja's own diverse support for Python's many language syntax features.

However, it is quite possible that the grammar is a bit more lax than Jinja itself is in some areas. That should not affect things *too* much for nearly all reasonable use cases.

Line Statements
---------------

Jinja has an odd line-based statement feature you can optionally enable in the Jinja2 Python engine. It looks like this::

  # for x in y
    ...
  # endfor

The grammar *does* technically support this simple use case, but if you want (as you probably do) use this grammar for multi-language documents, then you should know that *this* syntax is also legal, and is *not* supported at all by tree-sitter::

  # for x in y(1,
               2,
               3)

  # endfor

Multi-line "overhangs" like this, with parenthesised expressions, is legal syntax, but probably impossible to accurately capture without *another* parser to detect overhangs.
