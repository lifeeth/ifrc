<?xml version="1.0" encoding="utf-8"?>
<xsl:stylesheet
    xmlns:xsl="http://www.w3.org/1999/XSL/Transform" version="1.0">

    <!-- **********************************************************************
         S3CSV Common Templates

         2011-11-07 / Dominic König <dominic[at]aidiq[dot]com>

         Copyright (c) 2010 Sahana Software Foundation

         Permission is hereby granted, free of charge, to any person
         obtaining a copy of this software and associated documentation
         files (the "Software"), to deal in the Software without
         restriction, including without limitation the rights to use,
         copy, modify, merge, publish, distribute, sublicense, and/or sell
         copies of the Software, and to permit persons to whom the
         Software is furnished to do so, subject to the following
         conditions:

         The above copyright notice and this permission notice shall be
         included in all copies or substantial portions of the Software.

         THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
         EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
         OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
         NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
         HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
         WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
         FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
         OTHER DEALINGS IN THE SOFTWARE.

    *********************************************************************** -->

    <!-- Resolve Column header

         Helper template to resolve column header variants, using both
         an external labels.xml and the <labels> subtree in the source.

         Parameter column: the standard column label
         Output: a |-delimited string of alternative column labels
    -->

    <xsl:template name="ResolveColumnHeader">
        <xsl:param name="colname"/>
        <xsl:variable name="labels" select="document('labels.xml')//labels"/>
        <xsl:variable name="src" select="//labels/column[@name=$colname]"/>
        <xsl:variable name="map" select="$labels/column[@name=$colname]"/>
        <xsl:value-of select="concat('|', $colname, '|')"/>
        <xsl:for-each select="$src/label">
            <xsl:variable name="label" select="text()"/>
            <xsl:variable name="duplicates" select="preceding-sibling::label[text()=$label]"/>
            <xsl:if test="$label != $colname and not($duplicates)">
                <xsl:value-of select="concat($label, '|')"/>
            </xsl:if>
        </xsl:for-each>
        <xsl:for-each select="$map/label">
            <xsl:variable name="label" select="text()"/>
            <xsl:variable name="srcdup" select="$src/label[text()=$label]"/>
            <xsl:variable name="mapdup" select="preceding-sibling::label[text()=$label]"/>
            <xsl:if test="$label != $colname and not($srcdup) and not ($mapdup)">
                <xsl:value-of select="concat($label, '|')"/>
            </xsl:if>
        </xsl:for-each>
    </xsl:template>

    <!-- ****************************************************************** -->

    <!-- Get Column Value

         Extracts the value of a column in the current <row> and resolves
         any option label variants, using both an external labels.xml and
         the <labels> subtree in the source.

         Parameter colhdrs: all column header variants as a |-delimited
                            string (as returned from ResolveColumnHeader)
         Output: the column value
    -->

    <xsl:template name="GetColumnValue">
        <xsl:param name="colhdrs"/>
        <xsl:variable name="colname" select="substring-before(substring-after($colhdrs, '|'), '|')"/>
        <xsl:variable name="col" select="col[contains($colhdrs, concat('|', @field, '|'))][1]"/>
        <xsl:variable name="srcmap" select="//labels/column[@name=$colname]"/>
        <xsl:variable name="lblmap" select="document('labels.xml')//labels/column[@name=$colname]"/>
        <xsl:variable name="label" select="$col/text()"/>
        <xsl:variable name="alt1" select="$srcmap/option[@name=$label or ./label/text()=$label]"/>
        <xsl:variable name="alt2" select="$lblmap/option[@name=$label or ./label/text()=$label]"/>
        <xsl:choose>
            <xsl:when test="$alt1">
                <xsl:value-of select="$alt1[1]/@value"/>
            </xsl:when>
            <xsl:when test="$alt2">
                <xsl:value-of select="$alt2[1]/@value"/>
            </xsl:when>
            <xsl:otherwise>
                <xsl:value-of select="$label"/>
            </xsl:otherwise>
        </xsl:choose>
    </xsl:template>

    <!-- ****************************************************************** -->

</xsl:stylesheet>
