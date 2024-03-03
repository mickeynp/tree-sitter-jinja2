function commaSep1(rule) {
    return sep1(rule, ',');
}

function sep1(rule, separator) {
    return seq(rule, repeat(seq(separator, rule)));
}

function ensureAliased(s) {
    return alias(s, s);
}

const PREC = {
    // this resolves a conflict between the usage of ':' in a lambda vs in a
    // typed parameter. In the case of a lambda, we don't allow typed parameters.
    lambda: -2,
    typed_parameter: -1,
    conditional: -1,

    parenthesized_expression: 1,
    parenthesized_list_splat: 1,
    or: 10,
    and: 11,
    not: 12,
    compare: 13,
    bitwise_and: 15,
    xor: 16,
    shift: 17,
    plus: 18,
    times: 19,
    unary: 20,
    power: 21,
    unary_call: 22,
    call: 23,
    // Filters precedence is much narrower than other things:
    //
    // {{ a + b | c }} should be parsed as {{ a + (b | c) }}
    filter: 30,
};

const SEMICOLON = ';';


module.exports = grammar({
    name: 'jinja2',
    extras: $ => [
        /\s/,
        $.line_continuation,
    ],

    conflicts: $ => [
        [$.primary_expression, $.pattern],
        [$.primary_expression, $.list_splat_pattern],
        [$.tuple, $.tuple_pattern],
        [$.list, $.list_pattern],
        [$._if_statement, $._loop_statement],
        [$.primary_expression, $.callback_statement],
        [$.unary_call],
    ],

    supertypes: $ => [
        $.primary_expression,
        $.pattern,
        $.parameter,
    ],

    externals: $ => [
        $.comment,
        $.string,
    ],

    inline: $ => [
        $._expressions,
        $._left_hand_side,
        $.open_expression,
        $.close_expression,
        $.trim_open_expression,
        $.trim_close_expression,
        $.trim_open_statement,
        $.trim_close_statement,
    ],

    word: $ => $.identifier,

    rules: {
        fragment: $ => repeat(choice(
            $.fragment_expression,
            $.fragment_statement,
            $.fragment_comment,
        )),
        _expressions: $ => choice(
            $.expression,
            $.expression_list,
        ),

        parameter: $ => choice(
            $.identifier,
            $.default_parameter,
            $.list_splat_pattern,
            $.tuple_pattern,
            $.dictionary_splat_pattern,
        ),
        _parameters: $ => seq(
            commaSep1($.parameter),
            optional(','),
        ),
        parameters: $ => seq(
            '(',
            optional($._parameters),
            ')',
        ),
        _patterns: $ => seq(
            commaSep1($.pattern),
            optional(','),
        ),

        pattern: $ => choice(
            $.identifier,
            $.subscript,
            $.attribute,
            $.list_splat_pattern,
            $.tuple_pattern,
            $.list_pattern,
        ),

        tuple_pattern: $ => seq(
            '(',
            optional($._patterns),
            ')',
        ),

        list_pattern: $ => seq(
            '[',
            optional($._patterns),
            ']',
        ),

        default_parameter: $ => seq(
            field('name', choice($.identifier, $.tuple_pattern)),
            '=',
            field('value', $.expression),
        ),

        list_splat_pattern: $ => seq(
            '*',
            choice($.identifier, $.subscript, $.attribute),
        ),

        dictionary_splat_pattern: $ => seq(
            '**',
            choice($.identifier, $.subscript, $.attribute),
        ),


        list_splat: $ => seq(
            '*',
            $.expression,
        ),

        dictionary_splat: $ => seq(
            '**',
            $.expression,
        ),

        parenthesized_list_splat: $ => prec(PREC.parenthesized_list_splat, seq(
            '(',
            choice(
                alias($.parenthesized_list_splat, $.parenthesized_expression),
                $.list_splat,
            ),
            ')',
        )),

        argument_list: $ => seq(
            '(',
            optional(commaSep1(
                choice(
                    $.expression,
                    $.list_splat,
                    $.dictionary_splat,
                    alias($.parenthesized_list_splat, $.parenthesized_expression),
                    $.keyword_argument,
                ),
            )),
            optional(','),
            ')',
        ),

        expression_list: $ => prec.right(seq(
            $.expression,
            choice(
                ',',
                seq(
                    repeat1(seq(
                        ',',
                        $.expression,
                    )),
                    optional(','),
                ),
            ),
        )),

        dotted_name: $ => prec(1, sep1($.identifier, '.')),

        default_parameter: $ => seq(
            field('name', choice($.identifier, $.tuple_pattern)),
            '=',
            field('value', $.expression),
        ),

        list_splat_pattern: $ => seq(
            '*',
            choice($.identifier, $.subscript, $.attribute),
        ),

        dictionary_splat_pattern: $ => seq(
            '**',
            choice($.identifier, $.subscript, $.attribute),
        ),


        // Expressions

        expression: $ => choice(
            $.comparison_operator,
            $.test_operator,
            $.not_operator,
            $.boolean_operator,
            $.primary_expression,
            $.conditional_expression,
        ),

        primary_expression: $ => choice(
            $.filter_operator,
            $.coalesce_operator,
            $.binary_operator,
            $.identifier,
            $.string,
            // $.concatenated_string,
            $.integer,
            $.float,
            $.true,
            $.false,
            $.none,
            $.unary_operator,
            $.attribute,
            $.subscript,
            $.call,
            $.list,
            $.dictionary,
            $.tuple,
            $.parenthesized_expression,
            alias($.list_splat_pattern, $.list_splat),
        ),

        not_operator: $ => prec(PREC.not, seq(
            'not',
            field('argument', $.expression),
        )),

        boolean_operator: $ => choice(
            prec.left(PREC.and, seq(
                field('left', $.expression),
                field('operator', 'and'),
                field('right', $.expression),
            )),
            prec.left(PREC.or, seq(
                field('left', $.expression),
                field('operator', 'or'),
                field('right', $.expression),
            )),
        ),

        binary_operator: $ => {
            const table = [
                [prec.left, '+', PREC.plus],
                [prec.left, '-', PREC.plus],
                [prec.left, '*', PREC.times],
                [prec.left, '/', PREC.times],
                [prec.left, '%', PREC.times],
                [prec.left, '//', PREC.times],
                // This is left-associative in jinja for some reason.
                [prec.left, '**', PREC.power],
            ];

            // @ts-ignore
            return choice(...table.map(([fn, operator, precedence]) => fn(precedence, seq(
                field('left', $.primary_expression),
                // @ts-ignore
                field('operator', operator),
                field('right', $.primary_expression),
            ))));
        },
        // This is the filter ('|') operator.  It's right-associative
        // because filters are applied from left to right.
        filter_operator: $ => prec.right(PREC.filter, seq(
            field('left', $.primary_expression),
            field('operator', '|'),
            field('right', $.primary_expression),
        )),
        // Coalesce ('~') operator is a binary operator that turns
        // both LHS and RHS to strings and concatenates them.
        coalesce_operator: $ => prec.right(PREC.filter, seq(
            field('left', $.primary_expression),
            field('operator', '~'),
            field('right', $.primary_expression),
        )),

        unary_operator: $ => prec(PREC.unary, seq(
            field('operator', choice('+', '-')),
            field('argument', $.primary_expression),
        )),

        // Special version that handles the 'is' and 'is not'
        // operators.  This is necessary because the 'is' operator can
        // optionally support a special type of call where, if the
        // function takes just one argument, you can leave out the
        // brackets:
        //
        //     {{ if foo is divisibleby 3 }}
        //
        // is legal.
        test_operator: $ => prec.left(PREC.compare, seq(
            $.primary_expression,
            seq(
                choice(
                    'is',
                    alias(seq('is', 'not'), 'is not'),
                ),
                choice(
                    $.primary_expression,
                    $.unary_call),
            ),
        )),
        comparison_operator: $ => prec.left(PREC.compare, seq(
            $.primary_expression,
            repeat1(seq(
                field('operators',
                    choice(
                        '<',
                        '<=',
                        '==',
                        '!=',
                        '>=',
                        '>',
                        'in',
                        alias(seq('not', 'in'), 'not in'),
                    )),
                choice(
                    $.primary_expression),
            )),
        )),

        assignment: $ => seq(
            field('left', $._left_hand_side),
            seq('=', field('right', $._right_hand_side)),
        ),

        _left_hand_side: $ => choice(
            $.pattern,
            $.pattern_list,
        ),

        pattern_list: $ => prec(1,seq(
            $.pattern,
            choice(
                ',',
                seq(
                    repeat1(seq(
                        ',',
                        $.pattern,
                    )),
                    optional(','),
                ),
            ),
        )),

        // MP: is prec.left correct?
        _right_hand_side: $ => prec.left(choice(
            $.expression,
            $.expression_list,
            // MP: I am not sure if assignment is an equivalence
            // relation in Jinja. I cannot think of any place where it
            // is possible to associatively assign.

            // $.assignment,

            $.pattern_list,
        )),

        attribute: $ => prec(PREC.call, seq(
            field('object', $.primary_expression),
            '.',
            field('attribute', $.identifier),
        )),

        subscript: $ => prec(PREC.call, seq(
            field('value', $.primary_expression),
            '[',
            commaSep1(field('subscript', $.expression)),
            optional(','),
            ']',
        )),

        // Special call is a call that does not require brackets.
        // This is used for the 'is' and 'is not' operators, and then
        // only if the function has exactly one argument.
        unary_argument_list: $ => choice(
            $.expression,
            $.list_splat,
            $.dictionary_splat,
            alias($.parenthesized_list_splat, $.parenthesized_expression),
            $.keyword_argument,
        ),
        unary_call: $ => prec(PREC.unary_call, seq(
            field('function', $.identifier),
            /\s+?/,
            optional(field('argument', $.unary_argument_list)),
        )),
        call: $ => prec(PREC.call, seq(
            field('function', $.primary_expression),
            field('arguments', choice(
                $.argument_list,
            )),
        )),

        keyword_argument: $ => seq(
            field('name', $.identifier),
            '=',
            field('value', $.expression),
        ),

        // Literals

        list: $ => seq(
            '[',
            optional($._collection_elements),
            ']',
        ),

        tuple: $ => seq(
            '(',
            optional($._collection_elements),
            ')',
        ),

        dictionary: $ => seq(
            '{',
            optional(commaSep1(choice($.pair, $.dictionary_splat))),
            optional(','),
            '}',
        ),

        pair: $ => seq(
            field('key', $.expression),
            ':',
            field('value', $.expression),
        ),

        parenthesized_expression: $ => prec(PREC.parenthesized_expression, seq(
            '(',
            $.expression,
            ')',
        )),

        _collection_elements: $ => seq(
            seq(commaSep1(choice(
                $.expression, $.list_splat, $.parenthesized_list_splat,)),
                // MICKEY: make comma optional; right place for it, though?
                optional(',')),
        ),

        if_clause: $ => seq(
            'if',
            $.expression,
        ),

        conditional_expression: $ => prec.right(PREC.conditional, seq(
            $.expression,
            'if',
            $.expression,
            'else',
            $.expression,
        )),

        concatenated_string: $ => seq(
            $.string,
            repeat1($.string),
        ),

        integer: _ => token(choice(
            seq(
                choice('0x', '0X'),
                repeat1(/_?[A-Fa-f0-9]+/),
                optional(/[Ll]/),
            ),
            seq(
                choice('0o', '0O'),
                repeat1(/_?[0-7]+/),
                optional(/[Ll]/),
            ),
            seq(
                choice('0b', '0B'),
                repeat1(/_?[0-1]+/),
                optional(/[Ll]/),
            ),
            seq(
                repeat1(/[0-9]+_?/),
                choice(
                    optional(/[Ll]/), // long numbers
                    optional(/[jJ]/), // complex numbers
                ),
            ),
        )),

        float: _ => {
            const digits = repeat1(/[0-9]+_?/);
            const exponent = seq(/[eE][\+-]?/, digits);

            return token(seq(
                choice(
                    seq(digits, '.', optional(digits), optional(exponent)),
                    seq(optional(digits), '.', digits, optional(exponent)),
                    seq(digits, exponent),
                ),
                optional(/[jJ]/),
            ));
        },

        identifier: _ => /[_\p{XID_Start}][_\p{XID_Continue}]*/,

        true: _ => choice('True', 'true'),
        false: _ => choice('false', 'False'),
        none: _ => choice('none', 'None'),

        line_continuation: _ => token(seq('\\', choice(seq(optional('\r'), '\n'), '\0'))),

        fragment_comment: $ => seq('{', $.comment, '}'),
        // Block expression
        open_expression: $ => ensureAliased('{','{'),
        close_expression: $ => ensureAliased('}','}'),
        trim_open_expression: $ => choice('{+', '{-'),
        trim_close_expression: $ => choice('-}', '+}'),
        fragment_expression: $ => seq('{',
            choice($.trim_open_expression, $.open_expression),
            $.expression,
            choice($.trim_close_expression, $.close_expression),
            '}'
        ),
        //// Statement
        _comma_assignment: $ => seq(commaSep1($.assignment), optional(',')),
        _open_statement: $ => ensureAliased('{%','{%'),
        _close_statement: $ => ensureAliased('%}','%}'),
        trim_open_statement: $ => choice('{%+', '{%-'),
        trim_close_statement: $ => choice('-%}', '+%}'),
        fragment_statement: $ => choice(
            seq(
                choice($.trim_open_statement, $._open_statement),
                $.statement,
                choice($.trim_close_statement, $._close_statement),
            ),
        ),
        statement: $ => choice(
            $._import_statement,
            $._loop_statement,
            $._if_statement,
            $._macro_statement,
            $._call_statement,
            $._set_statement,
            $._block_statement,
            $._filter_statement,
            $.include_statement,
            $.extends_statement,
            $._with_statement,
            $._trans_statement,
            $.do_statement,
            $._autoescape_statement,
            $._raw_statement,
            $._generic_statement,
        ),
        // Generic statement calls that some third-party plugins inject into Jinja2. Try and support them also.
        _generic_statement: $ => seq(
            $.identifier,
            optional(commaSep1(choice($.keyword_argument, $.expression))),
        ),
        // Filter,
        _filter_statement: $ => choice(
            $.filter_statement,
            $.endfilter_statement,
        ),
        filter_statement: $ => seq(
            'filter',
            $.identifier,
        ),
        endfilter_statement: $ => ensureAliased('endfilter','endfilter'),
        // Raw
        _raw_statement: $ => choice(
            $.raw_statement,
            $.endraw_statement,
        ),
        raw_statement: $ => ensureAliased('raw','raw'),
        endraw_statement: $ => ensureAliased('endraw','endraw'),
        // Autoescape
        _autoescape_statement: $ => choice(
            $.autoescape_statement,
            $.endautoescape_statement,
        ),
        autoescape_statement: $ => seq(
            'autoescape',
            seq('true', 'false')
        ),
        endautoescape_statement: $ => ensureAliased('endautoescape','endautoescape'),
        // Do
        do_statement: $ => seq(
            'do',
            $.expression,
        ),
        // With
        _with_statement: $ => choice(
            $.with_statement,
            $.endwith_statement,
        ),
        with_statement: $ => seq('with', optional($._comma_assignment)),
        endwith_statement: $ => ensureAliased('endwith','endwith'),
        // Trans
        _trans_statement: $ => choice(
            $.trans_statement,
            $.endtrans_statement,
            $.pluralize_statement,
        ),
        pluralize_statement: $ => seq('pluralize', optional($.identifier)),
        trans_statement: $ => seq(
            'trans',
            optional('trimmed'), optional($._comma_assignment)),
        endtrans_statement: $ => ensureAliased('endtrans','endtrans'),
        // Set
        _set_statement: $ => choice(
            $.set_statement,
            $.endset_statement,
        ),
        set_statement: $ => seq(
            'set',
            $.assignment,
        ),
        endset_statement: $ => ensureAliased('endset','endset'),
        // Macro & Call statement
        _macro_statement: $ => choice(
            $.macro_statement,
            $.endmacro_statement,
        ),
        macro_statement: $ => seq(
            'macro',
            field('name', $.identifier),
            field('parameters', $.parameters),
        ),
        endmacro_statement: $ => alias('endmacro', 'endmacro'),
        _call_statement: $ => choice(
            $.call_statement,
            $.callback_statement,
            $.endcall_statement,
        ),
        call_statement: $ => seq(
            'call',
            $.call,
        ),
        callback_statement: $ => seq(
            'call',
            $.call,
            field('callback', $.call),
        ),
        endcall_statement: $ => ensureAliased('endcall','endcall'),
        // If Statement
        _if_statement: $ => choice(
            $.if_statement,
            $.elif_statement,
            $.else_statement,
            $.endif_statement,
        ),
        if_statement: $ => seq(
            'if',
            field('condition', $.expression),
        ),
        elif_statement: $ => seq(
            'elif',
            field('condition', $.expression),
        ),
        else_statement: $ => ensureAliased('else','else'),
        endif_statement: $ => ensureAliased('endif','endif'),

        // Loop statement
        _loop_statement: $ => choice(
            $.for_statement,
            $.else_statement,
            $.endfor_statement,
            $.break_statement,
            $.continue_statement,
        ),
        for_recursive: $ => ensureAliased('recursive','recursive'),
        for_statement: $ => seq(
            'for',
            // Use _left_hand_side to because expression is too broad
            // (and also cannot destructure) and because the LHS of a
            // for-loop is essentially the same as assignment binding
            field('left', $._left_hand_side),
            'in',
            field('right', $.expression),
            // Can you mix recursive and condition?
            optional($.for_recursive),
            optional(field('condition', $.if_clause)),
        ),
        else_statement: $ => seq('else', optional($.if_clause)),
        endfor_statement: $ => ensureAliased('endfor','endfor'),
        break_statement: $ => ensureAliased('break','break'),
        continue_statement: $ => ensureAliased('continue','continue'),

        // Import and Include
        // Handle "with context" / "without context" that include/import statements can have
        with_context: _ => seq('with', 'context'),
        without_context: _ => seq('without', 'context'),
        _context: $ => choice(
            $.with_context,
            $.without_context,
        ),
        _import_statement: $ => seq(
            choice(
                $.import_from_statement,
                $.import_statement,
            ),
            optional($._context)),

        // Simple import statement
        import_statement: $ => seq(
            'import',
            field('template', $.string),
            'as',
            field('alias', $.identifier),
        ),
        // aliasing construct
        aliased_import: $ => seq(
            field('name', $.dotted_name),
            'as',
            field('alias', $.identifier),
        ),
        // Import from statement
        import_from_statement: $ => seq(
            'from',
            field('template', $.string),
            'import',
            commaSep1(choice($.identifier,
                $.aliased_import)),
        ),

        ignore_missing: $ => seq('ignore', 'missing'),

        include_statement: $ => seq(
            'include',
            choice(
                // This can seemingly be an expression?
                // This is valid:
                //
                //  {% include 'foo' if layout_template is defined else none %}
                field('template', $.expression),
            ),
            optional($.ignore_missing),
            optional($._context),
        ),
        // Extends
        extends_statement: $ => seq(
            'extends',
            field('template', $.expression),
        ),
        // Block
        _block_statement: $ => choice(
            $.block_statement,
            $.endblock_statement,
        ),
        required_block: $ => ensureAliased('required','required'),
        scoped_block: $ => ensureAliased('scoped','scoped'),
        block_statement: $ => seq(
            'block',
            field('name', $.identifier),
            choice(optional($.required_block), optional($.scoped_block)),
        ),
        endblock_statement: $ => seq('endblock', optional(field('name', $.identifier))),
    }
});
